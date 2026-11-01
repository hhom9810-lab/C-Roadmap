@@page id="p5-async" phase="5" kind="topic" title="Task и async/await изнутри" nav="Task и async/await" est="~1 неделя"
:::why
«Ставь `await` и не думай» работает до первого deadlock-а или до API, который под нагрузкой перестаёт отвечать. Понимание того, **что на самом деле делает `await`**, объясняет, зачем весь ASP.NET Core асинхронный и почему неправильный async хуже синхронного кода.
:::

## Зачем это нужно

Backend большую часть времени **ждёт**: базу данных, другой сервис по HTTP, диск. Пока идёт ожидание, процессор свободен, а вот поток, на котором выполнялся запрос, при синхронном коде остаётся занятым. Потоков в пуле ограниченное число, и если каждый запрос держит свой поток, то при нагрузке потоки заканчиваются, а новые запросы стоят в очереди. Сервер при этом почти не загружает процессор, но «не отвечает»: это называется **thread pool starvation** (голодание пула потоков).

Асинхронность решает именно эту проблему: на время ожидания поток возвращается в пул и обслуживает другие запросы. Поэтому весь современный ASP.NET Core, EF Core и `HttpClient` построены на `Task`, а в вакансиях Junior .NET раздел «async/await» присутствует почти всегда.

Тема нужна, потому что:

- без понимания, что `await` *не* создаёт поток и *не* ускоряет отдельный запрос, невозможно отвечать на собеседованиях и правильно проектировать сервисы;
- ошибки в async-коде (зависания, потерянные исключения, лишние потоки) невозможно найти «на глаз», не зная модель;
- следующие темы фазы — [ловушки async](#p5-async-pitfalls), [многопоточность](#p5-concurrency) и [фоновые задачи](#p5-background) — опираются на модель из этой.

Все утверждения ниже проверены запуском: порядок выполнения, потоки, время и поведение завершённых задач.

## Интуиция и аналогия

**Повар у плиты и кухонный таймер.** Синхронный повар поставил воду кипятиться и стоит над кастрюлей, глядя на воду. Асинхронный повар ставит таймер, пока вода греется, режет овощи, а когда таймер звякнул, возвращается к кастрюле — возможно, уже в другой части кухни. Скорость закипания воды не изменилась (запрос к базе не стал быстрее), зато за час повар успевает приготовить больше блюд.

**Талон в электронной очереди.** `Task` — это талон, а не сам результат. Он говорит: «ваш результат будет, когда подойдёт очередь». Талон можно положить в карман и заняться другим (запустить несколько операций), а можно подождать у табло (`await`). Талон существует независимо от того, ждёшь ты его или нет: операция уже идёт.

**Закладка в книге.** Когда метод доходит до `await` и результат ещё не готов, он оставляет закладку («продолжить отсюда») и отдаёт книгу кому-то другому. Когда результат готов, любой свободный читатель (поток) открывает книгу на закладке и продолжает. Читатель может быть другой — книга от этого не меняется.

## Основная теория по шагам

### Шаг 1. Поток занят ожиданием или свободен

~~~text Синхронно: поток занят ожиданием
 поток #12: [принял запрос]──[ждёт ответа БД 80 мс ··················]──[ответил]
~~~

~~~text Асинхронно: поток свободен, пока идёт ожидание
 поток #12: [принял запрос]──[отправил запрос в БД] → вернулся в пул, обслуживает другие запросы
 ... БД ответила ...
 поток #7:                                         [продолжение: сформировал ответ]
~~~

Проверим идею на модели. Создадим «пул» всего из двух рабочих слотов (стандартный планировщик с ограничением параллелизма) и отправим в него шесть «запросов» по 200 мс. В одном случае каждый запрос блокирует слот (`Thread.Sleep`), в другом — ждёт асинхронно (`Task.Delay`):

~~~csharp
using System.Diagnostics;

var pool = new ConcurrentExclusiveSchedulerPair(TaskScheduler.Default, maxConcurrencyLevel: 2).ConcurrentScheduler;
var factory = new TaskFactory(pool);

var sw = Stopwatch.StartNew();
await Task.WhenAll(Enumerable.Range(0, 6).Select(_ => factory.StartNew(() => Thread.Sleep(200))));
var blocking = sw.ElapsedMilliseconds;

sw.Restart();
await Task.WhenAll(Enumerable.Range(0, 6).Select(_ => factory.StartNew(async () => await Task.Delay(200)).Unwrap()));
var asyncTime = sw.ElapsedMilliseconds;

Console.WriteLine($"Блокирующее ожидание: три «волны» по 2 запроса, не меньше 600 мс? {blocking >= 600}");
Console.WriteLine($"Асинхронное ожидание: все шесть вместе, меньше 500 мс?        {asyncTime < 500}");
~~~
~~~console
Блокирующее ожидание: три «волны» по 2 запроса, не меньше 600 мс? True
Асинхронное ожидание: все шесть вместе, меньше 500 мс?        True
~~~

Слотов всего два, но асинхронные запросы не держали слот во время ожидания, поэтому все шесть ожидали одновременно. Блокирующие же шли «волнами» по два. В реальном сервере вместо двух слотов — потоки пула, вместо `Task.Delay` — ожидание ответа базы, а эффект тот же.

:::key Async — это не «быстрее», а «не занимать поток ожиданием»
Отдельный запрос не становится быстрее от `await`. Растёт **пропускная способность**: больше запросов на тех же потоках. Для вычислений (CPU-bound) async ничего не даёт — там нужен параллелизм.
:::

### Шаг 2. `Task` — обещание результата

`Task` — объект, представляющий операцию, которая завершится в будущем: успешно (с результатом для `Task<T>`), с исключением или отменой. Подробнее о типе — в справочнике: [Task и Task<T>](#/ref/f/as-task). Важно: `Task` — это **не поток**. Задача может вообще не занимать поток (ожидание сети), а может быть выполнена на потоке пула (`Task.Run`). Чтобы увидеть, что `Task` — только «обещание», создадим его вручную через `TaskCompletionSource` и завершим из другого места:

~~~csharp
var tcs = new TaskCompletionSource<string>();

var waiter = Task.Run(async () =>
{
    var value = await tcs.Task;                 // ждём «обещание», ни одного потока не занято
    return $"получено: {value}";
});

await Task.Delay(50);
Console.WriteLine($"Обещание выполнено? {tcs.Task.IsCompleted}");
tcs.SetResult("привет");                        // кто-то выполнил обещание
Console.WriteLine(await waiter);

var failing = new TaskCompletionSource<int>();
failing.SetException(new InvalidOperationException("сервис недоступен"));
try { await failing.Task; }
catch (Exception e) { Console.WriteLine($"await бросает исключение из задачи: {e.Message}"); }
~~~
~~~console
Обещание выполнено? False
получено: привет
await бросает исключение из задачи: сервис недоступен
~~~

Так устроены все «настоящие» асинхронные операции: драйвер базы отправляет запрос в сеть, возвращает вам задачу, а когда приходит ответ, выполняет `SetResult` (или `SetException`).

### Шаг 3. Что делает `await`

`await` говорит: «когда задача завершится, продолжи этот метод отсюда; а пока — верни управление вызывающему». Ключевой момент: **async-метод выполняется синхронно до первого `await` на незавершённой задаче**. Проверим по порядку сообщений:

~~~csharp
var log = new List<string>();

async Task<int> WorkAsync()
{
    log.Add("2. внутри метода, до await");
    await Task.Delay(100);
    log.Add("4. внутри метода, после await");
    return 42;
}

log.Add("1. перед вызовом");
var task = WorkAsync();
log.Add($"3. вызов вернулся; задача завершена? {task.IsCompleted}");
var result = await task;
log.Add($"5. await закончился, результат {result}");
log.ForEach(Console.WriteLine);

// если задача уже завершена, await не приостанавливает метод
async Task<int> FastAsync() { await Task.CompletedTask; return 1; }
int before = Environment.CurrentManagedThreadId;
var fast = FastAsync();
Console.WriteLine($"Уже завершённая задача: IsCompleted={fast.IsCompleted}, тот же поток: {before == Environment.CurrentManagedThreadId}");
~~~
~~~console
1. перед вызовом
2. внутри метода, до await
3. вызов вернулся; задача завершена? False
4. внутри метода, после await
5. await закончился, результат 42
Уже завершённая задача: IsCompleted=True, тот же поток: True
~~~

Строка 3 выводится раньше строки 4: вызов вернулся, а метод «заморожен» на `await`. Для уже завершённой задачи (результат из кэша, данные уже в буфере) метод не приостанавливается вовсе, и накладных расходов на переключение нет — поэтому для горячих путей придумали [`ValueTask`](#/ref/f/as-valuetask).

### Шаг 4. После `await` метод может продолжиться на другом потоке

Исходный поток во время ожидания был свободен, поэтому продолжение выполняется на любом свободном потоке пула (если нет контекста синхронизации, требующего конкретного потока; в ASP.NET Core его нет, в консольном приложении — тоже):

~~~csharp
Console.WriteLine($"До await: поток пула? {Thread.CurrentThread.IsThreadPoolThread}");
await Task.Delay(50);
Console.WriteLine($"После await: поток пула? {Thread.CurrentThread.IsThreadPoolThread}");
~~~
~~~console
До await: поток пула? False
После await: поток пула? True
~~~

Главный поток консольной программы — не из пула, а продолжение после `await` выполнилось на потоке пула. Номера потоков при этом не детерминированы, и опираться на них нельзя: это ещё одна причина не хранить данные запроса в `[ThreadStatic]`-полях.

### Шаг 5. `Task` уже запущен: `await` не стартует операцию

Частая путаница: кажется, что операция начинается в момент `await`. На самом деле она начинается при **вызове** метода, а `await` лишь ждёт. Поэтому, чтобы выполнить две независимые операции одновременно, достаточно сначала запустить обе, а потом ждать:

~~~csharp
using System.Diagnostics;

var sw = Stopwatch.StartNew();
await DownloadAsync("A");
await DownloadAsync("B");
Console.WriteLine($"Последовательно (не меньше 600 мс): {sw.ElapsedMilliseconds >= 600}");

sw.Restart();
var a = DownloadAsync("A");            // операция уже идёт
var b = DownloadAsync("B");            // и эта тоже
await a; await b;
Console.WriteLine($"Запустили обе, потом ждём (меньше 500 мс): {sw.ElapsedMilliseconds < 500}");

sw.Restart();
await Task.WhenAll(DownloadAsync("A"), DownloadAsync("B"), DownloadAsync("C"));
Console.WriteLine($"WhenAll трёх операций (меньше 500 мс): {sw.ElapsedMilliseconds < 500}");

static async Task<string> DownloadAsync(string name)
{
    await Task.Delay(300);             // имитация ожидания сети/БД
    return name;
}
~~~
~~~console
Последовательно (не меньше 600 мс): True
Запустили обе, потом ждём (меньше 500 мс): True
WhenAll трёх операций (меньше 500 мс): True
~~~

`Task.WhenAll` — удобная обёртка над тем же приёмом; подробности — [WhenAll и WhenAny](#/ref/f/as-whenall).

### Шаг 6. Что компилятор делает с `async`-методом

Как и с [`yield return`](#p2-iterators), компилятор превращает `async`-метод в **машину состояний**:

~~~text Упрощённо
 async Task<string> DownloadAsync(...)       →   структура-машина состояний:
   код до await                                  state 0: выполнить код до await;
   await Task.Delay(ms)                                   если задача не завершена — подписать
   код после await                                        продолжение и ВЕРНУТЬ управление
                                                 state 1: (вызывается, когда задача завершилась)
                                                          выполнить код после await
~~~

Локальные переменные становятся полями машины, поэтому переживают «паузу». Если задача уже завершена к моменту `await`, метод просто продолжается синхронно, без переключений (мы это видели в шаге 3).

### Шаг 7. I/O-bound и CPU-bound

| Тип работы | Пример | Инструмент |
|---|---|---|
| Ожидание ввода-вывода | запрос к БД, HTTP, файл | `async`/`await` с настоящими асинхронными API (`ToListAsync`, `HttpClient.GetAsync`) |
| Вычисления | обработка изображения, хэширование тысяч паролей | `Task.Run` (в настольных приложениях), `Parallel.For` |

:::warn `Task.Run` в ASP.NET Core
В веб-приложении `await Task.Run(() => SyncWork())` в обработчике запроса ничего не выигрывает: работа всё равно занимает поток пула, просто другой. Для вычислений в API — выполнить синхронно или вынести в фоновую задачу.
:::

### Шаг 8. Правила повседневного async-кода

- Асинхронно **сверху донизу**: если вызываешь async-метод — сам становишься async и `await`-ишь его.
- Имена асинхронных методов — с суффиксом `Async`.
- Возвращай `Task`/`Task<T>`, принимай `CancellationToken` последним параметром (см. [отмену](#/ref/f/as-cancellation)).
- Не смешивай синхронные блокировки (`.Result`, `.Wait()`) с асинхронным кодом — об этом [следующая тема](#p5-async-pitfalls).

~~~csharp Типичный асинхронный сервис @nocheck
public async Task<TaskResponse> GetAsync(int id, CancellationToken ct)
{
    var task = await _db.Tasks
        .AsNoTracking()
        .Where(t => t.Id == id)
        .Select(t => new TaskResponse(t.Id, t.Title, t.Status.ToString(), t.AssigneeId, t.CompletedAt))
        .SingleOrDefaultAsync(ct);                                   // поток свободен, пока ждём БД
    return task ?? throw new NotFoundException($"Задача {id} не найдена");
}
~~~

## Как это работает под капотом

- **Метод `await` — это не блокировка.** Компилятор превращает выражение в обращение к «ожидателю» (`GetAwaiter()`): если `IsCompleted` — взять результат сразу, иначе зарегистрировать продолжение (`OnCompleted`) и выйти из метода. Когда задача завершается, продолжение ставится в очередь выполнения.
- **Машина состояний.** Для каждого async-метода генерируется структура (в Release) или класс (в Debug) с полем `state`, полями для локальных переменных и методом `MoveNext`. Первый вызов `MoveNext` происходит синхронно из вашего вызова; после каждого завершённого ожидания `MoveNext` вызывается снова. Если метод дошёл до конца синхронно, объект-задача может даже не выделяться (для кэшируемых результатов).
- **Контекст.** При `await` библиотека запоминает «где продолжать»: контекст синхронизации (в WPF/WinForms это UI-поток) или текущий `TaskScheduler`. В ASP.NET Core контекста синхронизации нет, поэтому продолжение идёт на поток пула. Разница между «возвращаться в исходный контекст» и «не возвращаться» (`ConfigureAwait(false)`) важна для библиотек и UI, в ASP.NET Core на неё обычно можно не опираться.
- **Пул потоков.** Рабочие потоки пула берут задания из очередей. Если все потоки заняты *блокирующими* вызовами, новые задания ждут, а пул медленно добавляет потоки (примерно по одному в полсекунды). Это и есть голодание: сервер «зависает», хотя процессор простаивает. Подробности — [потоки и пул](#/ref/f/as-threads).
- **Как ожидание вообще не занимает поток.** Сетевой ввод-вывод в ОС асинхронен: приложение отправляет запрос и регистрирует уведомление (на Linux — через epoll, на Windows — порты завершения ввода-вывода). Когда данные пришли, ОС уведомляет рантайм, и тот выполняет `SetResult` у соответствующей задачи. Между отправкой и ответом ни один управляемый поток не нужен.
- **Исключения хранятся в задаче.** Если в async-методе возникло исключение, метод не бросает его вызывающему: он завершает возвращённый `Task` в состоянии `Faulted`, а исключение бросит `await`. Подробнее — в [ловушках async](#p5-async-pitfalls) и справочнике [об исключениях](#/ref/f/as-exceptions).
- **Что стоит дорого.** Каждый `await` на незавершённой задаче — это выделение памяти (объект машины, делегат продолжения) и переключение контекста. Поэтому «обернуть всё в async» бессмысленно: метод без реального ожидания лучше сделать синхронным.

## Типичные ошибки и ловушки

- **Считать, что `await` создаёт поток.** Он освобождает поток; новый поток при ожидании ввода-вывода не создаётся.
- **Ожидать ускорения одного запроса.** Выигрыш только в пропускной способности.
- **Последовательные `await` независимых операций.** Две независимые выборки по 100 мс занимают 200 мс вместо 100; запускай обе и жди вместе.
- **`Task.Run` вокруг асинхронного или синхронного кода в обработчике запроса.** Смена потока без выгоды плюс накладные расходы.
- **Синхронный вызов асинхронного API (`.Result`, `.Wait()`).** Занимает поток и может привести к взаимной блокировке — тема [следующей страницы](#p5-async-pitfalls).
- **Забытый `await`.** Задача уходит «в фон», исключения теряются, метод завершается раньше времени (предупреждение CS4014).
- **Асинхронный метод без ожидания.** Предупреждение CS1998: накладные расходы без пользы.
- **Опора на номер потока или `[ThreadStatic]`.** После `await` поток другой.
- **Предположение, что запросы одного пользователя идут по порядку.** Каждый запрос — своя цепочка задач.
- **Смешение CPU-bound и I/O-bound.** Асинхронность не ускорит вычисления.
- **Игнорирование `CancellationToken`.** Клиент отключился, а сервер продолжает работу.

## Вопросы с собеседований

:::spoiler Делает ли async один запрос быстрее? (ловушка: «да, он же параллельный»)
Нет. Он освобождает поток на время ожидания ввода-вывода, и сервер обслуживает больше запросов одновременно. Время ответа на отдельный запрос не уменьшается (иногда чуть растёт из-за накладных расходов).
:::

:::spoiler Почему после await код может выполниться на другом потоке?
Пока операция шла, исходный поток вернулся в пул и занялся другой работой. Продолжение метода запускается на любом свободном потоке пула (если нет контекста синхронизации, требующего конкретного потока, — в ASP.NET Core его нет).
:::

:::spoiler Чем `await A(); await B();` отличается от `await Task.WhenAll(A(), B());`?
В первом случае B начнётся только после окончания A — время складывается. Во втором обе операции запускаются сразу и ожидаются вместе — время примерно равно максимальному.
:::

:::spoiler Что такое Task? Это поток?
Нет. `Task` — объект, представляющий будущий результат операции (успех, исключение или отмена). Он может выполняться на потоке пула, а может не занимать потока вовсе (ожидание сети).
:::

:::spoiler Что делает компилятор с async-методом?
Превращает его в машину состояний: код делится на участки по `await`, локальные переменные становятся полями, а после завершения ожидаемой задачи вызывается продолжение со следующего участка.
:::

:::spoiler Когда `await` не приостанавливает метод?
Когда ожидаемая задача уже завершена: метод продолжается синхронно, без переключения потока.
:::

:::spoiler Что такое thread pool starvation и как её вызвать?
Все потоки пула заняты блокирующими вызовами (`.Result`, `Thread.Sleep`, синхронный ввод-вывод), и новые задания ждут свободный поток, а пул добавляет потоки медленно. Сервер «висит» при низкой загрузке процессора.
:::

:::spoiler Нужен ли `Task.Run` в обработчике веб-запроса, чтобы «не блокировать» сервер? (ловушка)
Нет. Обработчик и так выполняется на потоке пула; `Task.Run` лишь переносит работу на другой поток пула и добавляет накладные расходы. Для настоящего ввода-вывода нужен асинхронный API, для долгих вычислений — фоновая обработка вне запроса.
:::

## Что запомнить

- Async экономит **потоки**, а не время одного запроса: поток свободен, пока идёт ожидание ввода-вывода.
- `Task` — обещание результата, а не поток; исключение хранится в задаче и выбрасывается на `await`.
- Операция стартует при **вызове** метода; `await` только ждёт. Независимые операции запускай вместе и жди через `WhenAll`.
- Async-метод выполняется синхронно до первого `await` на незавершённой задаче; завершённая задача не приостанавливает метод.
- После `await` поток может смениться; не опирайся на номер потока и `[ThreadStatic]`.
- `Task.Run` в обработчике запроса не помогает; для вычислений — параллелизм, для ввода-вывода — асинхронные API.
- Асинхронно сверху донизу, суффикс `Async`, `CancellationToken` последним параметром.
- Блокировать асинхронный код (`.Result`, `.Wait()`) нельзя — см. следующую тему.

## Практика

- [ ] Запустил пример и объяснил номера потоков и время
- [ ] Сделал 5 «загрузок» по 300 мс последовательно и через `WhenAll`, сравнил время
- [ ] Перевёл все методы проекта Фазы 4 на async сверху донизу с `CancellationToken`
- [ ] Своими словами описал в заметках, что такое thread pool starvation

@@page id="p5-async-pitfalls" phase="5" kind="topic" title="Ловушки async: deadlock, async void, отмена" nav="Ловушки async" est="~1 неделя"
:::why
**Первый пункт критерия:** объяснить разницу `async Task` и `async void`. Плюс deadlock на `.Result` — один из самых известных вопросов про .NET. Эти ошибки не ловятся компилятором и проявляются под нагрузкой или в редких сценариях.
:::

## Зачем это нужно

Ошибки в асинхронном коде коварны тем, что программа компилируется, проходит быстрый ручной тест и ломается только в особых условиях: под нагрузкой, при редком порядке выполнения, при отключении клиента. Исключение «потерялось» — и никто не узнал об ошибке; процесс внезапно упал — и в логах пусто; сервис «завис» при нулевой загрузке процессора. Все эти симптомы — следствия нескольких повторяющихся ловушек, и их можно перечислить поимённо.

Эта тема нужна, потому что:

- вопросы «`async Task` и `async void`», «почему `.Result` — плохо», «как отменять операции» задают на каждом собеседовании по .NET;
- в реальном проекте именно эти ошибки превращаются в самые тяжёлые инциденты;
- нет другого способа научиться их видеть, кроме как воспроизвести каждую хотя бы раз. Поэтому ниже **каждая ловушка запущена и показана на воспроизводимом примере**, включая настоящий deadlock (на специально созданном однопоточном контексте).

Базовая модель `Task` и `await` разобрана в [предыдущей теме](#p5-async); здесь мы смотрим на то, что идёт не так.

## Интуиция и аналогия

**Письмо без обратного адреса (`async void`).** Если отправить письмо и не получить номер отправления (`Task`), узнать о судьбе письма невозможно: дошло ли, потерялось ли, ответили ли. А если письмо вернулось с ошибкой, его вернут «на почтамт» (пул потоков), где никто не ждёт, и почтамт закроется (процесс упадёт).

**Двое в узком коридоре (deadlock).** Один держит дверь и ждёт, пока второй пройдёт, а второй ждёт, пока дверь отпустят. Каждый ждёт другого — навсегда. `.Result` на потоке с контекстом синхронизации — ровно такая ситуация: поток ждёт результата, а результату нужен этот самый поток, чтобы завершиться.

**Стоп-кран (`CancellationToken`).** Он не останавливает поезд сам: он лишь поднимает флаг. Машинист (код) обязан смотреть на флаг и тормозить. Если машинист не смотрит — поезд едет дальше.

## Основная теория по шагам

### Шаг 1. `async void` — почти всегда ошибка {#asyncvoid}

У метода `async Task` исключение попадает в возвращаемый `Task` и «ждёт» там, пока кто-нибудь выполнит `await`. У `async void` задачи нет, исключению некуда деться, и оно выбрасывается в контекст синхронизации (в UI-приложениях) или в пул потоков (в консольном приложении и ASP.NET Core). Там обработчика нет, и это **необработанное исключение процесса**. Чтобы не ронять процесс в примере, перехватим его последний рубеж (`UnhandledException`) и выйдем сами:

~~~csharp
AppDomain.CurrentDomain.UnhandledException += (s, e) =>
{
    Console.WriteLine($"Необработанное исключение процесса: {((Exception)e.ExceptionObject).Message} (процесс завершается: {e.IsTerminating})");
    Environment.Exit(0);
};

try
{
    FireAndForget();                       // async void: вернуть Task некуда
}
catch (Exception)
{
    Console.WriteLine("Поймали");          // НЕ выполнится
}
Console.WriteLine("main продолжает работу");
await Task.Delay(500);
Console.WriteLine("сюда не дойдём");

static async void FireAndForget()
{
    await Task.Delay(50);
    throw new InvalidOperationException("Бум");
}
~~~
~~~console
main продолжает работу
Необработанное исключение процесса: Бум (процесс завершается: True)
~~~

`try/catch` вокруг вызова не сработал: на момент исключения вызывающий код давно ушёл дальше. Теперь тот же метод с `async Task`:

~~~csharp
try
{
    await FailAsync();                     // задача хранит исключение, await его выбрасывает
}
catch (InvalidOperationException e)
{
    Console.WriteLine($"Поймали: {e.Message}");
}

var task = FailAsync();                    // не ждём — процесс не падает, исключение лежит в задаче
await Task.Delay(100);
Console.WriteLine($"Задача завершилась с ошибкой: {task.IsFaulted}, исключение: {task.Exception!.InnerException!.Message}");

static async Task FailAsync()
{
    await Task.Delay(50);
    throw new InvalidOperationException("Бум");
}
~~~
~~~console
Поймали: Бум
Задача завершилась с ошибкой: True, исключение: Бум
~~~

| | `async Task` | `async void` |
|---|---|---|
| Можно ли дождаться (`await`) | да | **нет** |
| Где окажется исключение | внутри `Task`, вылетит в месте `await` | выбрасывается в контекст/пул потоков → **падение процесса** |
| Узнать, что операция завершилась | да | нет |
| Тестировать | легко | трудно |
| Когда допустим | всегда | **только** обработчики событий (`button.Click += async (s, e) => ...`), где сигнатура навязана |

:::key Формулировка для критерия
«`async Task` возвращает задачу: вызывающий может её дождаться, получить результат и исключение. У `async void` задачи нет: вызывающий не знает, когда метод закончился, а исключение нельзя поймать снаружи — оно уходит в пул потоков и роняет процесс. Поэтому `async void` — только для обработчиков событий.»
:::

### Шаг 2. Deadlock на `.Result` / `.Wait()`

Классический сценарий: в UI-приложении (WinForms/WPF) или в старом ASP.NET на .NET Framework есть **контекст синхронизации**, который выполняет код только на одном потоке (UI-потоке). После `await` продолжение по умолчанию возвращается в этот контекст. Если поток контекста заблокирован в `.Result`, продолжение не может выполниться, а `.Result` ждёт завершения этого продолжения.

~~~text
 Поток UI: ждёт .Result  ───────────────┐
                                        │ ждут друг друга
 Продолжение после await: ждёт поток UI ┘ → программа зависла навсегда
~~~

Воспроизведём это без графического интерфейса: напишем крошечный контекст синхронизации с одним потоком (он ведёт себя как UI-поток) и вызовем асинхронный метод с блокировкой. Чтобы не повесить пример навсегда, используем `Wait` с таймаутом:

~~~csharp
using System.Collections.Concurrent;

var ui = new SingleThreadContext();                 // «поток UI»

// 1. Блокируем «поток UI» ожиданием результата
bool ok1 = await ui.RunAsync(() => Task.FromResult(GetDataAsync().Wait(500)));
Console.WriteLine($"Wait() на «потоке UI»: завершилось за 500 мс? {ok1}");

// 2. То же, но продолжение не возвращается в контекст (ConfigureAwait(false))
bool ok2 = await ui.RunAsync(() => Task.FromResult(GetDataNoContextAsync().Wait(500)));
Console.WriteLine($"С ConfigureAwait(false):  завершилось за 500 мс? {ok2}");

// 3. Правильно: async сверху донизу
string data = await ui.RunAsync(async () => await GetDataAsync());
Console.WriteLine($"await вместо Wait():      получили «{data}»");

static async Task<string> GetDataAsync()
{
    await Task.Delay(100);                 // продолжение хочет вернуться в «поток UI»
    return "данные";
}

static async Task<string> GetDataNoContextAsync()
{
    await Task.Delay(100).ConfigureAwait(false);
    return "данные";
}

sealed class SingleThreadContext : SynchronizationContext
{
    private readonly BlockingCollection<(SendOrPostCallback, object?)> _queue = new();

    public SingleThreadContext()
    {
        new Thread(() =>
        {
            SetSynchronizationContext(this);
            foreach (var (callback, state) in _queue.GetConsumingEnumerable()) callback(state);
        }) { IsBackground = true }.Start();
    }

    public override void Post(SendOrPostCallback d, object? state) => _queue.Add((d, state));

    public Task<T> RunAsync<T>(Func<Task<T>> work)
    {
        var tcs = new TaskCompletionSource<T>();
        Post(async _ =>
        {
            try { tcs.SetResult(await work()); }
            catch (Exception e) { tcs.SetException(e); }
        }, null);
        return tcs.Task;
    }
}
~~~
~~~console
Wait() на «потоке UI»: завершилось за 500 мс? False
С ConfigureAwait(false):  завершилось за 500 мс? True
await вместо Wait():      получили «данные»
~~~

Первый случай — настоящий deadlock: блокирующее ожидание на «потоке UI» не завершилось, потому что продолжению после `Task.Delay` нужен именно этот поток. (Без таймаута программа зависла бы навсегда.) `ConfigureAwait(false)` разрывает цикл, потому что продолжение выполняется на пуле. Но правильное лечение — третий случай: **async сверху донизу**.

**В ASP.NET Core контекста синхронизации нет**, и классического deadlock не будет. Проверим на настоящем сервере:

~~~csharp
var builder = WebApplication.CreateBuilder();
builder.WebHost.UseUrls("http://127.0.0.1:0");
builder.Logging.ClearProviders();
var app = builder.Build();
app.MapGet("/ctx", async () =>
{
    var before = SynchronizationContext.Current is null;
    await Task.Delay(10);
    return $"контекста синхронизации нет: {before}";
});
await app.StartAsync();
using var http = new HttpClient { BaseAddress = new Uri(app.Urls.First()) };
Console.WriteLine(await http.GetStringAsync("/ctx"));
await app.StopAsync();
~~~
~~~console
контекста синхронизации нет: True
~~~

Но `.Result`/`.Wait()` в ASP.NET Core всё равно вредны: поток блокируется на всё время ожидания (теряется смысл async), и под нагрузкой это приводит к голоданию пула потоков — сервис «замерзает» без единой ошибки в логах. Мы воспроизводили это на модели с двумя слотами в [предыдущей теме](#p5-async).

:::tip `ConfigureAwait(false)`
В коде **библиотек** (которые могут вызываться из UI-приложений) пишут `await x.ConfigureAwait(false)` — «не возвращайся в исходный контекст». В коде приложения на ASP.NET Core это не нужно. Правильное лечение deadlock-а — не `ConfigureAwait`, а **async сверху донизу**.
:::

Если синхронный вызов асинхронного кода всё же неизбежен (например, в `Main` старой библиотеки), различай способы: `.Result` и `.Wait()` оборачивают исключения в `AggregateException`, а `GetAwaiter().GetResult()` разворачивает их, как это делает `await`:

~~~csharp
var task = FailAsync();
try { _ = task.Result; }
catch (Exception e) { Console.WriteLine($".Result бросает: {e.GetType().Name} → {e.InnerException!.GetType().Name}"); }

try { FailAsync().GetAwaiter().GetResult(); }
catch (Exception e) { Console.WriteLine($"GetAwaiter().GetResult() бросает: {e.GetType().Name}"); }

try { await FailAsync(); }
catch (Exception e) { Console.WriteLine($"await бросает: {e.GetType().Name}"); }

static async Task<int> FailAsync()
{
    await Task.Delay(10);
    throw new InvalidOperationException("Бум");
}
~~~
~~~console
.Result бросает: AggregateException → InvalidOperationException
GetAwaiter().GetResult() бросает: InvalidOperationException
await бросает: InvalidOperationException
~~~

### Шаг 3. Отмена: `CancellationToken`

Клиент закрыл вкладку, истёк таймаут, приложение останавливается — продолжать работу бессмысленно. Отмена в .NET **кооперативная**: токен лишь сообщает «отмена запрошена», а код сам решает, когда остановиться. Подробнее — в справочнике: [CancellationToken](#/ref/f/as-cancellation).

~~~csharp
using var cts = new CancellationTokenSource();
try
{
    await SlowAsync(cts);
}
catch (OperationCanceledException)
{
    Console.WriteLine("Операция отменена");
}

static async Task SlowAsync(CancellationTokenSource cts)
{
    for (int i = 1; i <= 10; i++)
    {
        if (i == 4) cts.Cancel();                 // «клиент отключился» перед четвёртым шагом
        await Task.Delay(50, cts.Token);          // передаём токен дальше — отмена прервёт ожидание
        Console.WriteLine($"  шаг {i}");
    }
}
~~~
~~~console
  шаг 1
  шаг 2
  шаг 3
Операция отменена
~~~

Если же код токен не проверяет, он будет работать дальше как ни в чём не бывало:

~~~csharp
using var cts = new CancellationTokenSource();
int steps = 0;
for (int i = 1; i <= 5; i++)
{
    if (i == 2) cts.Cancel();
    await Task.Delay(10);                         // токен не передан и не проверяется
    steps++;
}
Console.WriteLine($"Отмена запрошена: {cts.IsCancellationRequested}, но выполнено шагов: {steps}");

// ThrowIfCancellationRequested — проверка в цикле вычислений
try
{
    for (int i = 0; i < 1_000_000; i++)
    {
        if (i == 3) cts.Cancel();
        cts.Token.ThrowIfCancellationRequested();
    }
}
catch (OperationCanceledException) { Console.WriteLine("Вычисление остановлено проверкой токена"); }

// Таймаут и отмена клиентом объединяются связанным источником
using var timeout = new CancellationTokenSource(TimeSpan.FromMilliseconds(50));
using var client = new CancellationTokenSource();
using var linked = CancellationTokenSource.CreateLinkedTokenSource(timeout.Token, client.Token);
try { await Task.Delay(5000, linked.Token); }
catch (OperationCanceledException e)
{
    Console.WriteLine($"{e.GetType().Name}: сработал таймаут: {timeout.IsCancellationRequested}, клиент: {client.IsCancellationRequested}");
}
~~~
~~~console
Отмена запрошена: True, но выполнено шагов: 5
Вычисление остановлено проверкой токена
TaskCanceledException: сработал таймаут: True, клиент: False
~~~

В ASP.NET Core токен запроса приходит бесплатно — добавь параметр `CancellationToken ct` в эндпоинт и передавай его во все async-вызовы (`ToListAsync(ct)`, `SaveChangesAsync(ct)`, `HttpClient.GetAsync(url, ct)`). Если клиент отключился — запрос к базе тоже отменится. Исключение отмены (`OperationCanceledException`, её подкласс `TaskCanceledException`) — не ошибка: его не логируют как `Error` и не превращают в `500`.

### Шаг 4. Забытый `await` и «огонь и забвение»

~~~csharp
var log = new List<string>();

async Task SendEmailAsync()
{
    await Task.Delay(100);
    log.Add("письмо отправлено");
}

async Task HandleRequestAsync()
{
    _ = SendEmailAsync();                      // нет await: запрос не ждёт письма
    log.Add("ответ клиенту отправлен");
}

await HandleRequestAsync();
log.Add("метод запроса завершён (после него освобождается DbContext и scope)");
await Task.Delay(200);
log.ForEach(Console.WriteLine);

// исключение забытой задачи никто не увидит
async Task BrokenAsync() { await Task.Delay(10); throw new InvalidOperationException("потерянная ошибка"); }
_ = BrokenAsync();
await Task.Delay(100);
Console.WriteLine("процесс жив, ошибки в выводе нет — исключение осталось внутри забытой задачи");
~~~
~~~console
ответ клиенту отправлен
метод запроса завершён (после него освобождается DbContext и scope)
письмо отправлено
процесс жив, ошибки в выводе нет — исключение осталось внутри забытой задачи
~~~

:::danger Забытый await
`_ = SendEmailAsync(...)` или просто вызов без `await` — исключение потеряется, а сервис может завершить запрос раньше, чем операция закончилась (и `DbContext` уже будет освобождён). Компилятор предупреждает (CS4014) — не игнорируй. Работу «в фоне» делают через [фоновые задачи](#p5-background).
:::

### Шаг 5. `async`-лямбда в `List.ForEach` и LINQ

~~~csharp
var items = new List<int> { 1, 2, 3 };

int done = 0;
items.ForEach(async x => { await Task.Delay(50); done++; });      // ForEach принимает Action, а не Func<Task>: это async void
Console.WriteLine($"Сразу после ForEach выполнено: {done}");

await Task.Delay(200);
Console.WriteLine($"Позже: {done}");

done = 0;
await Task.WhenAll(items.Select(async x => { await Task.Delay(50); Interlocked.Increment(ref done); }));
Console.WriteLine($"После WhenAll: {done}");

foreach (var x in items) { await Task.Delay(10); }                // последовательно и честно
~~~
~~~console
Сразу после ForEach выполнено: 0
Позже: 3
После WhenAll: 3
~~~

:::danger `async` лямбда в `List.ForEach` или LINQ
`items.ForEach(async x => await SaveAsync(x));` — это `async void` в замаскированном виде: `ForEach` не ждёт задачи. Используй `foreach` с `await` или `Task.WhenAll(items.Select(SaveAsync))`.
:::

### Шаг 6. Исключения в `WhenAll`

`await Task.WhenAll(...)` выбрасывает только **первое** исключение; остальные лежат в `task.Exception`. Если ошибки важны (например, для журнала), нужно сохранить задачу и посмотреть все исключения:

~~~csharp
var all = Task.WhenAll(Fail("A", 10), Fail("B", 80), Task.Delay(10));
try { await all; }
catch (Exception e) { Console.WriteLine($"await выбросил только: {e.Message}"); }
Console.WriteLine($"В задаче хранится ошибок: {all.Exception!.InnerExceptions.Count} → {string.Join(", ", all.Exception.InnerExceptions.Select(x => x.Message))}");

static async Task Fail(string name, int delay)
{
    await Task.Delay(delay);
    throw new InvalidOperationException($"ошибка {name}");
}
~~~
~~~console
await выбросил только: ошибка A
В задаче хранится ошибок: 2 → ошибка A, ошибка B
~~~

### Шаг 7. Параллельные операции на одном `DbContext`

`DbContext` EF Core не потокобезопасен и не поддерживает несколько одновременных операций. Реальный EF мы здесь запустить не можем, поэтому смоделируем ровно это поведение: объект, который бросает исключение при пересечении операций, как EF Core (там сообщение: «A second operation was started on this context instance before a previous operation completed»).

~~~csharp
var db = new FakeDbContext();

try { await Task.WhenAll(db.QueryAsync("Tasks"), db.QueryAsync("Users")); }
catch (InvalidOperationException e) { Console.WriteLine($"Параллельно: {e.Message}"); }

await Task.Delay(100);
var a = await db.QueryAsync("Tasks");
var b = await db.QueryAsync("Users");
Console.WriteLine($"Последовательно: {a}, {b}");

sealed class FakeDbContext
{
    private int _busy;
    public async Task<string> QueryAsync(string table)
    {
        if (Interlocked.Increment(ref _busy) > 1)
        {
            Interlocked.Decrement(ref _busy);
            throw new InvalidOperationException("A second operation was started on this context instance before a previous operation completed.");
        }
        try { await Task.Delay(30); return $"{table}: ok"; }
        finally { Interlocked.Decrement(ref _busy); }
    }
}
~~~
~~~console
Параллельно: A second operation was started on this context instance before a previous operation completed.
Последовательно: Tasks: ok, Users: ok
~~~

Для параллельных запросов нужны **разные** экземпляры `DbContext` (фабрика `IDbContextFactory<T>`) или последовательное выполнение.

## Как это работает под капотом

- **Куда девается исключение async-метода.** Компилятор оборачивает тело в `try/catch`: пойманное исключение записывается в возвращаемый `Task` (`SetException`). Для `async void` возвращать нечего, и билдер `AsyncVoidMethodBuilder` отправляет исключение в `SynchronizationContext.Post` (или в пул потоков), откуда оно становится необработанным.
- **Что такое контекст синхронизации.** Это абстракция «куда вернуть продолжение». UI-контекст ставит его в очередь UI-потока, контекст классического ASP.NET привязывал продолжение к контексту запроса. При `await` текущий контекст запоминается и используется для продолжения; `ConfigureAwait(false)` отключает это.
- **Почему deadlock именно такой.** `.Result` блокирует поток контекста, продолжение после `await` помещено в очередь этого же потока — очередь не обрабатывается, пока поток заблокирован. Круг замкнулся. В нашей модели `SingleThreadContext` — тот же механизм с одним потоком и очередью.
- **Почему `.Result` вредно и без контекста.** Блокирующее ожидание держит поток пула. Пул добавляет потоки медленно, поэтому при росте нагрузки появляется очередь заданий, а таймауты и «зависания» приходят волной. Диагностика — счётчики пула потоков (`dotnet-counters`), очередь пула и число потоков при стабильно низком CPU.
- **Как работает токен отмены.** `CancellationTokenSource` хранит флаг и список зарегистрированных обратных вызовов. `Cancel()` ставит флаг и вызывает их. `Task.Delay(ms, token)`, `HttpClient`, EF Core регистрируют обратный вызов, который завершает задачу состоянием «Canceled» и освобождает ожидание. Код без регистрации и проверок отмену не заметит.
- **Состояния `Task`.** `RanToCompletion`, `Faulted` (исключение), `Canceled`. `await` на отменённой задаче бросает `OperationCanceledException`, на «упавшей» — исходное исключение. Поэтому фильтр `catch (Exception ex) when (ex is not OperationCanceledException)` отделяет настоящие ошибки от штатной отмены.
- **Неотслеженные исключения.** Если задачу с ошибкой никто не ждал, ошибка всплывает лишь событием `TaskScheduler.UnobservedTaskException` при сборке мусора — с задержкой, и процесс при этом не падает. Полагаться на это событие нельзя.
- **Почему `DbContext` и параллельные запросы несовместимы.** Он хранит одно соединение, одно состояние трекера изменений и одно текущее чтение данных; EF Core проверяет пересечение и бросает исключение, чтобы не испортить данные.

## Типичные ошибки и ловушки

- **`async void` вне обработчиков событий.** Исключение роняет процесс, дождаться метод нельзя.
- **`.Result`, `.Wait()`, `.GetAwaiter().GetResult()` в асинхронной цепочке.** Взаимная блокировка в UI/старом ASP.NET, голодание пула в ASP.NET Core.
- **Попытка лечить deadlock `ConfigureAwait(false)` вместо перехода на async.** Маскирует проблему в одном месте.
- **Не передан `CancellationToken`.** Отключившийся клиент продолжает нагружать базу и сервис.
- **Токен принят, но не проверяется** в долгом цикле вычислений — отмена не работает.
- **Логирование отмены как ошибки** (`OperationCanceledException` в `Error`): шум в логах.
- **Забытый `await` / `_ = Method()`.** Исключение потеряно, запрос завершается раньше, чем работа, `DbContext` уже освобождён.
- **`async` лямбда в `ForEach`.** Замаскированный `async void`.
- **`await Task.WhenAll` и анализ только первого исключения.** Остальные ошибки теряются.
- **Параллельные запросы на одном `DbContext`.** Исключение или порча данных.
- **`async` метод без `await`** (CS1998) и `Task.Run` вокруг async-кода: накладные расходы без выгоды.
- **Блокировка в конструкторе или статическом инициализаторе** через `.Result`: вешает приложение при запуске.

## Вопросы с собеседований

:::spoiler Чем `async Task` отличается от `async void`? (вопрос из критерия)
`async Task` возвращает задачу: её можно ждать, получить результат и исключение. `async void` задачи не возвращает: вызывающий не знает о завершении, исключение нельзя поймать снаружи — оно уходит в контекст/пул потоков и роняет процесс. Допустим только для обработчиков событий.
:::

:::spoiler Почему исключение из async void роняет процесс?
У метода нет `Task`, в котором исключение могло бы «подождать» до `await`. Рантайм выбрасывает его в контекст синхронизации или в пул потоков, где обработчика нет, — это необработанное исключение процесса.
:::

:::spoiler Почему в ASP.NET Core нет классического deadlock-а на .Result, но так всё равно нельзя?
В ASP.NET Core нет SynchronizationContext, поэтому продолжению не нужен заблокированный поток. Но блокирующее ожидание занимает поток пула всё время ожидания; под нагрузкой это приводит к нехватке потоков и зависанию сервиса.
:::

:::spoiler Объясни, как возникает deadlock при вызове `.Result` в UI-приложении.
Поток UI блокируется в `.Result`, ожидая завершения задачи. Продолжение после `await` должно вернуться в поток UI, но он занят ожиданием. Каждый ждёт другого.
:::

:::spoiler Зачем передавать CancellationToken до самого низа?
Чтобы отмена (отключение клиента, таймаут, остановка приложения) действительно прерывала работу — ожидание БД, HTTP-вызовы, циклы, — а не только верхний уровень.
:::

:::spoiler Что произойдёт, если вызвать `Cancel()`, а код токен не проверяет? (ловушка: «операция прервётся»)
Ничего: отмена кооперативная. Токен лишь устанавливает флаг и вызывает обратные вызовы; код должен сам передавать токен в отменяемые API или проверять `ThrowIfCancellationRequested`.
:::

:::spoiler Чем `.Result` отличается от `GetAwaiter().GetResult()`?
Оба блокируют поток. `.Result` оборачивает исключение в `AggregateException`, `GetAwaiter().GetResult()` выбрасывает исходное, как `await`.
:::

:::spoiler Что будет с исключением в задаче, которую вызвали без `await`?
Оно сохраняется в задаче и никем не наблюдается: процесс не падает, ошибка теряется (в лучшем случае всплывёт событие `UnobservedTaskException` при сборке мусора). Поэтому без `await` задачи не запускают.
:::

## Что запомнить

- `async void` — только для обработчиков событий; всюду иначе `async Task`. Исключение из `async void` роняет процесс.
- `.Result`/`.Wait()` блокируют поток: в UI — deadlock, в ASP.NET Core — голодание пула. Лечение: async сверху донизу, а не `ConfigureAwait(false)`.
- Отмена кооперативна: протаскивай `CancellationToken` до EF Core, `HttpClient` и циклов; `OperationCanceledException` — не ошибка.
- Задача с исключением без `await` — потерянное исключение; запрос может завершиться раньше работы.
- `async`-лямбда в `ForEach` — это `async void`; используй `foreach` или `WhenAll`.
- `await WhenAll` бросает первое исключение; остальные — в `task.Exception`.
- Один `DbContext` — одна операция в момент времени.
- Включи CS4014 как ошибку: компилятор найдёт забытые `await`.

## Практика

- [ ] Воспроизвёл падение процесса из-за `async void`, затем переписал на `async Task` и поймал исключение
- [ ] Нашёл в проекте все места без `CancellationToken` и протянул токен до EF Core и HttpClient
- [ ] Включил анализатор/предупреждения CS4014 как ошибки (`<WarningsAsErrors>CS4014</WarningsAsErrors>`) и исправил найденное
- [ ] Записал голосовую заметку: «async Task vs async void» и «почему .Result — плохо» — ответы для критерия

@@page id="p5-concurrency" phase="5" kind="topic" title="Многопоточность: гонки, lock, Interlocked, SemaphoreSlim" nav="Многопоточность" est="4–5 дней"
:::why
В типичном backend многопоточность нужна **реже, чем кажется**: каждый HTTP-запрос и так обрабатывается своим потоком, а общие данные лежат в базе, которая сама управляет конкурентностью. Но там, где состояние общее (кэш в памяти, синглтон, счётчики, ограничение параллельных вызовов), без этих примитивов будут гонки.
:::

## Зачем это нужно

Сервер обрабатывает много запросов одновременно, и каждый из них выполняется на своём потоке пула. Пока запросы работают с собственными данными (локальные переменные, свой `DbContext`), проблем нет. Но стоит двум запросам коснуться **общего изменяемого состояния** — поля синглтона, словаря-кэша, статического счётчика, — и результат начинает зависеть от случайного порядка выполнения. Такие ошибки называются гонками (race condition): они не воспроизводятся стабильно, не видны в отладчике (шаг за шагом всё работает), проявляются под нагрузкой и приводят к «иногда неверным» данным — самому неприятному классу багов.

Эта тема нужна, чтобы:

- распознавать код с общим изменяемым состоянием и понимать, почему он опасен;
- выбирать минимально достаточный инструмент: неизменяемые данные, `Interlocked`, `lock`, `SemaphoreSlim`, `Concurrent*`-коллекции;
- ограничивать число одновременных вызовов внешних сервисов;
- отвечать на вопросы собеседований: «что такое race condition», «чем `lock` отличается от `SemaphoreSlim`», «почему нельзя `await` внутри `lock`», «что такое deadlock и как его избежать».

Все утверждения ниже проверены запуском. Гонки по своей природе случайны, поэтому для воспроизводимого вывода мы либо расписываем чередование шагов вручную, либо выводим только устойчивые признаки (например, «итог меньше ожидаемого»).

## Интуиция и аналогия

**Два бухгалтера и одна тетрадь.** В тетради записан остаток 100. Бухгалтер А читает «100», бухгалтер Б читает «100». А прибавляет 10 и записывает «110». Б прибавляет 20 и записывает «120». Итог — 120, хотя должно быть 130: вклад А потерян. Каждый из них работал честно — ошибка в **порядке чередования**. Исправления: тетрадь выдаётся одному бухгалтеру за раз (`lock`), либо запись — единое неделимое действие (`Interlocked`), либо у каждого своя тетрадь, а итог суммируется в конце (локальные данные).

**Кабинка в туалете (`lock`) и N кабинок (`SemaphoreSlim`).** `lock` — одна кабинка: пока кто-то внутри, остальные ждут. `SemaphoreSlim(3)` — три кабинки: внутрь пускают не больше трёх, остальные в очереди. Важно **выходить и отдавать ключ** при любом исходе (`finally`), иначе очередь стоит вечно.

**Два человека в узком коридоре (deadlock).** Каждый занял одну дверь и ждёт, пока освободится вторая, которую держит другой. Классическая причина — разный порядок захвата замков.

**Шкафчик с замком, в который складывают неизменяемые вещи.** Если вещи нельзя менять (запечатаны), их можно сколько угодно показывать разным людям без всякой очереди. Поэтому первый способ борьбы с гонками — не менять общие данные вообще.

## Основная теория по шагам

### Шаг 1. Гонка: почему `counter++` теряет увеличения

`counter++` — это три шага: прочитать значение, прибавить единицу, записать обратно. Если два потока выполняют эти шаги вперемешку, одно увеличение теряется. Распишем чередование вручную — без случайностей:

~~~csharp
int shared = 0;

// Два «потока» выполняют shared++ как три шага: прочитать → прибавить → записать.
// Чередование: A читает, B читает, A пишет, B пишет.
int a = shared;          // A: прочитал 0
int b = shared;          // B: прочитал 0
a = a + 1;               // A: прибавил
b = b + 1;               // B: прибавил
shared = a;              // A: записал 1
shared = b;              // B: записал 1 (увеличение A потеряно)

Console.WriteLine($"Ожидали 2, получили {shared}");
~~~
~~~console
Ожидали 2, получили 1
~~~

Теперь то же на настоящих потоках: четыре потока по десять миллионов увеличений, стартующих одновременно. Точное значение каждый раз разное, поэтому печатаем устойчивый признак. И сразу три исправления:

~~~csharp
const int Threads = 4, Iterations = 10_000_000;

static void RunThreads(Action body)
{
    var start = new Barrier(Threads);                      // все потоки стартуют одновременно
    var threads = Enumerable.Range(0, Threads).Select(_ => new Thread(() => { start.SignalAndWait(); body(); })).ToList();
    threads.ForEach(t => t.Start());
    threads.ForEach(t => t.Join());
}

bool lost = false;
for (int attempt = 0; attempt < 10 && !lost; attempt++)       // гонка случайна: повторяем, пока не поймаем потерю
{
    int unsafeCounter = 0;
    RunThreads(() => { for (int i = 0; i < Iterations; i++) unsafeCounter++; });
    lost = unsafeCounter < Threads * Iterations;
}
Console.WriteLine($"Без синхронизации: ожидали {Threads * Iterations}, потеряны увеличения: {lost}");

int lockCounter = 0;
var gate = new Lock();
RunThreads(() => { for (int i = 0; i < Iterations; i++) lock (gate) lockCounter++; });
Console.WriteLine($"lock:        {lockCounter}");

int atomicCounter = 0;
RunThreads(() => { for (int i = 0; i < Iterations; i++) Interlocked.Increment(ref atomicCounter); });
Console.WriteLine($"Interlocked: {atomicCounter}");

int localSum = 0;
RunThreads(() =>
{
    int local = 0;                                   // у каждого потока своя копия — гонки нет
    for (int i = 0; i < Iterations; i++) local++;
    Interlocked.Add(ref localSum, local);            // к общему значению обращаемся один раз
});
Console.WriteLine($"Локальные суммы: {localSum}");
~~~
~~~console
Без синхронизации: ожидали 40000000, потеряны увеличения: True
lock:        40000000
Interlocked: 40000000
Локальные суммы: 40000000
~~~

Четвёртый способ часто самый лучший: **не делить состояние**. Каждый поток считает у себя, а общий итог собирается один раз в конце. Это быстрее и проще, чем защищать каждое увеличение. Гонка здесь — тот же «lost update», что и в [транзакциях](#p3-transactions), только в памяти процесса.

### Шаг 2. Инструменты

| Инструмент | Для чего | Важно |
|---|---|---|
| Неизменяемые объекты (`record`, `readonly`, `IReadOnly*`) | данные, которые не меняются, потокобезопасны бесплатно | первый выбор |
| `Interlocked.Increment/Add/CompareExchange` | атомарные операции над одним числом или ссылкой | быстро, без блокировок |
| `lock (obj) { ... }` | короткая критическая секция в синхронном коде | **нельзя `await` внутри `lock`** (компилятор запретит) |
| `SemaphoreSlim` | ограничить число одновременных операций; асинхронный «замок» | `await WaitAsync()` + `Release()` в `finally` |
| `ConcurrentDictionary`, `ConcurrentQueue` | общие коллекции | составные операции всё равно не атомарны |
| `Channel<T>` | передача заданий между производителем и потребителем | см. [фоновые задачи](#p5-background) |

Справочник по примитивам: [Interlocked, SemaphoreSlim и другие](#/ref/f/as-sync-primitives).

### Шаг 3. `Interlocked.CompareExchange`: обновление «если не изменилось»

Атомарное увеличение — частный случай общей идеи **compare-and-swap**: «запиши новое значение, только если сейчас там ожидаемое старое; иначе повтори». Так можно атомарно обновлять и более сложные значения, например максимум:

~~~csharp
int max = 0;

void UpdateMax(int candidate)
{
    int seen = Volatile.Read(ref max);
    while (candidate > seen)
    {
        int previous = Interlocked.CompareExchange(ref max, candidate, seen);   // записать, только если max всё ещё равен seen
        if (previous == seen) return;                                           // получилось
        seen = previous;                                                        // кто-то успел раньше — пробуем снова
    }
}

Parallel.For(0, 100_000, i => UpdateMax(i));
Console.WriteLine($"Максимум по всем потокам: {max}");
~~~
~~~console
Максимум по всем потокам: 99999
~~~

### Шаг 4. `lock`: правила

`lock` берёт замок на объекте; пока один поток внутри, остальные ждут. В C# 13 / .NET 9+ для этого есть выделенный тип `System.Threading.Lock` (быстрее и яснее намерение), в старом коде используют `object`. Правила:

- замок — **приватный** объект (`private readonly Lock _gate = new();`); не блокируйся на `this`, строках или типах — их может захватить посторонний код;
- внутри `lock` — только короткая работа без ввода-вывода и без вызовов чужого кода;
- **внутри `lock` нельзя `await`** — компилятор запретит. Замок привязан к потоку, а после `await` код может продолжиться на другом потоке, освободить замок было бы некому;
- если нужно несколько замков, всегда бери их в одном и том же порядке.

Последнее правило проверим: два потока берут два замка в разном порядке и зависают друг на друге. Чтобы пример не завис навсегда, второй замок берём с таймаутом, а момент, когда оба потока уже держат по одному замку, синхронизируем барьером:

~~~csharp
var lockA = new object();
var lockB = new object();
var barrier = new Barrier(2);
var results = new bool[2];

var t1 = new Thread(() =>
{
    lock (lockA)
    {
        barrier.SignalAndWait();                          // оба потока уже держат по замку
        results[0] = Monitor.TryEnter(lockB, 200);        // нужен второй замок, а он у соседа
        barrier.SignalAndWait();                          // не отпускаем свой замок, пока сосед тоже не попробовал
    }
});
var t2 = new Thread(() =>
{
    lock (lockB)                                          // противоположный порядок
    {
        barrier.SignalAndWait();
        results[1] = Monitor.TryEnter(lockA, 200);
        barrier.SignalAndWait();
    }
});
t1.Start(); t2.Start(); t1.Join(); t2.Join();

Console.WriteLine($"Поток 1 получил второй замок: {results[0]}; поток 2 получил второй замок: {results[1]}");
Console.WriteLine("Без таймаута оба ждали бы вечно: это deadlock");
~~~
~~~console
Поток 1 получил второй замок: False; поток 2 получил второй замок: False
Без таймаута оба ждали бы вечно: это deadlock
~~~

Лекарство: единый порядок захвата (всегда A, затем B), один замок на обе структуры или отказ от замков в пользу неизменяемых данных и очередей.

### Шаг 5. `SemaphoreSlim`: не больше N одновременно

`SemaphoreSlim(N)` пускает внутрь не больше N участников; остальные ждут. `WaitAsync()` ждёт **асинхронно** — поток не блокируется, поэтому в отличие от `lock` внутри можно `await`. Классическое применение — ограничение параллельных вызовов внешнего API:

~~~csharp
using System.Diagnostics;

foreach (var limit in new[] { 1, 3, 10 })
{
    var gate = new SemaphoreSlim(limit);
    int current = 0, maxSeen = 0;
    var sw = Stopwatch.StartNew();

    await Task.WhenAll(Enumerable.Range(1, 10).Select(async i =>
    {
        await gate.WaitAsync();                    // взять пропуск или асинхронно подождать
        try
        {
            int now = Interlocked.Increment(ref current);
            int seen;
            while (now > (seen = Volatile.Read(ref maxSeen)) && Interlocked.CompareExchange(ref maxSeen, now, seen) != seen) { }
            await Task.Delay(200);                 // вызов внешнего сервиса
            Interlocked.Decrement(ref current);
        }
        finally
        {
            gate.Release();                        // вернуть пропуск в любом случае
        }
    }));

    int waves = (int)Math.Ceiling(10.0 / limit);
    bool timeOk = sw.ElapsedMilliseconds >= waves * 180 && sw.ElapsedMilliseconds < waves * 200 + 400;
    Console.WriteLine($"Пропусков {limit,2}: одновременно работало не больше {maxSeen}, «волн» по 200 мс: {waves}, время сходится: {timeOk}");
}
~~~
~~~console
Пропусков  1: одновременно работало не больше 1, «волн» по 200 мс: 10, время сходится: True
Пропусков  3: одновременно работало не больше 3, «волн» по 200 мс: 4, время сходится: True
Пропусков 10: одновременно работало не больше 10, «волн» по 200 мс: 1, время сходится: True
~~~

`SemaphoreSlim(1)` — асинхронный аналог `lock`: в нём можно `await`. Смысл блока `try/finally` проверим ошибкой: если `Release` не вызван (например, из-за исключения до `try`), следующие участники ждут вечно:

~~~csharp
var gate = new SemaphoreSlim(1);

await gate.WaitAsync();                                   // взяли пропуск и забыли вернуть
bool entered = await gate.WaitAsync(TimeSpan.FromMilliseconds(100));
Console.WriteLine($"Второй участник вошёл за 100 мс: {entered}");   // без таймаута ждал бы вечно

gate.Release();
entered = await gate.WaitAsync(TimeSpan.FromMilliseconds(100));
Console.WriteLine($"После Release вошёл: {entered}");
~~~
~~~console
Второй участник вошёл за 100 мс: False
После Release вошёл: True
~~~

Для массовых операций есть готовый вариант: `Parallel.ForEachAsync` с `MaxDegreeOfParallelism`:

~~~csharp
int current = 0, maxSeen = 0, processed = 0;

await Parallel.ForEachAsync(Enumerable.Range(1, 12), new ParallelOptions { MaxDegreeOfParallelism = 3 }, async (i, ct) =>
{
    int now = Interlocked.Increment(ref current);
    int seen;
    while (now > (seen = Volatile.Read(ref maxSeen)) && Interlocked.CompareExchange(ref maxSeen, now, seen) != seen) { }
    await Task.Delay(50, ct);
    Interlocked.Decrement(ref current);
    Interlocked.Increment(ref processed);
});

Console.WriteLine($"Обработано {processed} из 12, одновременно не больше {maxSeen}");
~~~
~~~console
Обработано 12 из 12, одновременно не больше 3
~~~

### Шаг 6. `ConcurrentDictionary` и составные операции

Потокобезопасная коллекция защищает **отдельные операции**, но не последовательность «проверил — вставил». Для составных действий есть атомарные методы:

~~~csharp
var cache = new System.Collections.Concurrent.ConcurrentDictionary<int, string>();

// ❌ проверка и вставка — две операции: между ними другой поток может вставить значение
// if (!cache.ContainsKey(id)) cache[id] = Load(id);

// ✅ одна атомарная операция
string value = cache.GetOrAdd(42, id => $"Задача {id}");
Console.WriteLine(value);

// Но у GetOrAdd есть тонкость: фабрика при гонке может выполниться несколько раз
int factoryCalls = 0;
var barrier = new Barrier(2);
var cache2 = new System.Collections.Concurrent.ConcurrentDictionary<int, string>();

string[] seen = new string[2];
var threads = Enumerable.Range(0, 2).Select(n => new Thread(() =>
{
    seen[n] = cache2.GetOrAdd(1, key =>
    {
        Interlocked.Increment(ref factoryCalls);
        barrier.SignalAndWait();                       // оба потока уже внутри фабрики
        return $"значение от потока {n}";
    });
})).ToList();
threads.ForEach(t => t.Start()); threads.ForEach(t => t.Join());

Console.WriteLine($"Фабрика выполнилась раз: {factoryCalls}; в словаре одно значение, и оба потока получили его: {seen[0] == seen[1]}");

// Если фабрика тяжёлая или с побочными эффектами — оборачивай в Lazy<T>
int lazyCalls = 0;
var cache3 = new System.Collections.Concurrent.ConcurrentDictionary<int, Lazy<string>>();
Parallel.For(0, 1000, i => { _ = cache3.GetOrAdd(1, k => new Lazy<string>(() => { Interlocked.Increment(ref lazyCalls); return "тяжёлая загрузка"; })).Value; });
Console.WriteLine($"С Lazy тяжёлая загрузка выполнилась раз: {lazyCalls}");
~~~
~~~console
Задача 42
Фабрика выполнилась раз: 2; в словаре одно значение, и оба потока получили его: True
С Lazy тяжёлая загрузка выполнилась раз: 1
~~~

### Шаг 7. Где это встречается в backend

Покажем на настоящем сервере: синглтон-счётчик посещений, в который одновременно пишут сотни запросов. Увеличение через `Interlocked` не теряет ни одного обращения:

~~~csharp
var builder = WebApplication.CreateBuilder();
builder.WebHost.UseUrls("http://127.0.0.1:0");
builder.Logging.ClearProviders();
builder.Services.AddSingleton<HitCounter>();
var app = builder.Build();
app.MapGet("/hit", (HitCounter c) => c.Hit());
await app.StartAsync();

using var http = new HttpClient { BaseAddress = new Uri(app.Urls.First()) };
await Parallel.ForEachAsync(Enumerable.Range(0, 300), new ParallelOptions { MaxDegreeOfParallelism = 30 }, async (_, ct) => await http.GetStringAsync("/hit", ct));

Console.WriteLine($"Запросов отправлено: 300, учтено синглтоном: {app.Services.GetRequiredService<HitCounter>().Total}");
await app.StopAsync();

sealed class HitCounter
{
    private int _total;
    public int Total => Volatile.Read(ref _total);
    public int Hit() => Interlocked.Increment(ref _total);      // потокобезопасно; _total++ могло бы потерять обращения
}
~~~
~~~console
Запросов отправлено: 300, учтено синглтоном: 300
~~~

- **Singleton-сервисы** (кэш в памяти, счётчики, rate limiter) — их вызывают из многих запросов одновременно.
- **Фоновые задачи** и обработчики очередей.
- **Ограничение параллелизма** при массовых вызовах внешних API — `SemaphoreSlim` или `Parallel.ForEachAsync` с `MaxDegreeOfParallelism`.

Для данных в базе — транзакции, ограничения и блокировки в самой базе, а не `lock` в C#: экземпляров приложения может быть несколько, и `lock` в одном процессе ничего не знает о другом.

:::deep Граница
Модель памяти, `volatile`, барьеры, lock-free структуры, `SpinLock`, `ReaderWriterLockSlim` — уровень системного программирования. Для junior backend достаточно таблицы инструментов выше.
:::

## Как это работает под капотом

- **Почему `counter++` не атомарно.** На уровне процессора это загрузка значения в регистр, сложение и сохранение. Операционная система может переключить поток между любыми двумя из этих инструкций, а на многоядерном процессоре два потока вообще исполняются одновременно. Поэтому чередование из нашего ручного примера возможно в любой момент.
- **Как работает `Interlocked`.** Это обёртка над атомарными инструкциями процессора (например, `lock xadd` и `cmpxchg` на x86). Операция «прочитать-изменить-записать» выполняется как одно неделимое действие, без захвата замка ОС. Поэтому она на порядок быстрее `lock`.
- **Как работает `lock`.** Компилятор превращает его в вызовы `Monitor.Enter`/`Monitor.Exit` с `try/finally`. Монитор сначала немного «крутится» в ожидании (spin), потом блокирует поток средствами ОС. Захват свободного замка очень дешёв; конкуренция за него — нет. Замок реентерабелен: тот же поток может войти повторно.
- **Почему `await` внутри `lock` запрещён.** Монитор принадлежит потоку; продолжение после `await` может оказаться на другом потоке, который не владеет замком, а исходный поток замок так и не освободит.
- **Как работает `SemaphoreSlim`.** Хранит счётчик свободных пропусков и очередь ожидающих. `WaitAsync` уменьшает счётчик или возвращает незавершённую задачу и ставит продолжение в очередь; `Release` увеличивает счётчик и завершает одну из ожидающих задач. Потоки при этом не блокируются.
- **Видимость изменений между потоками.** Процессор и компилятор могут переупорядочивать операции и кэшировать значения; без синхронизации один поток может долго не видеть запись другого. Все примитивы выше расставляют нужные барьеры памяти; поэтому внутри `lock` или при `Interlocked` читать и писать можно без дополнительных ухищрений, а `volatile` без понимания лучше не применять.
- **Потоки и пул.** `Parallel.For` и `Parallel.ForEachAsync` берут рабочие потоки из пула и распределяют между ними части работы. `MaxDegreeOfParallelism` ограничивает число одновременных исполнителей. Подробнее — [Parallel и PLINQ](#/ref/f/as-parallel) и [потоки и пул](#/ref/f/as-threads).
- **Почему `lock` не защищает от нескольких экземпляров API.** Он работает внутри одного процесса. Два контейнера с вашим API — это два независимых процесса и два независимых замка; согласованность данных между ними обеспечивает база (транзакции, уникальные индексы, `UPDATE ... WHERE`).

## Типичные ошибки и ловушки

- **Общее изменяемое состояние в singleton без защиты.** Поле, словарь, список в синглтоне, в которые пишут запросы.
- **`Dictionary`/`List` из нескольких потоков.** Они не потокобезопасны: вплоть до исключений и бесконечных циклов.
- **Проверка-затем-действие на `Concurrent*`-коллекции** (`ContainsKey` → индексатор). Используй `GetOrAdd`/`AddOrUpdate`/`TryAdd`.
- **Фабрика `GetOrAdd` с побочными эффектами.** Может выполниться несколько раз; тяжёлое оберни в `Lazy<T>`.
- **`await` внутри `lock`.** Не компилируется; используй `SemaphoreSlim(1)`.
- **Нет `finally` с `Release()`.** Один сбой — и все ждут вечно.
- **Разный порядок захвата замков.** Классический deadlock.
- **Блокировка на `this`, типе или строке.** Посторонний код может захватить тот же замок.
- **Длинная работа внутри `lock`** (запрос в базу, HTTP): всё остальное выстраивается в очередь.
- **`lock` вместо транзакции базы** для защиты данных, общих для нескольких экземпляров приложения.
- **«Починить» гонку `Thread.Sleep`.** Гонка исчезает на вашей машине и возвращается на сервере.
- **Чтение состояния без синхронизации при записи под замком.** Читать надо тоже под замком или через `Volatile.Read`/`Interlocked`.
- **Создание потоков вручную в обработчике запроса.** Используй пул, `Task`, фоновые службы.

## Вопросы с собеседований

:::spoiler Почему `counter++` из нескольких потоков теряет увеличения?
Это неатомарная последовательность «прочитать — изменить — записать». Потоки читают одно и то же старое значение и перезаписывают результаты друг друга.
:::

:::spoiler Почему внутри lock нельзя await и что использовать вместо?
`lock` привязан к потоку, а после `await` код может продолжиться на другом потоке — освободить блокировку было бы некому. Для асинхронного кода — `SemaphoreSlim(1)` с `WaitAsync`/`Release`.
:::

:::spoiler Защитит ли lock в C# от двойной выдачи последнего экземпляра книги?
Только в рамках одного процесса. При нескольких экземплярах API (или другом клиенте базы) — нет. Защищать нужно в базе: транзакция с блокировкой строки, атомарный UPDATE или ограничение.
:::

:::spoiler Что такое race condition? Приведи пример.
Результат зависит от случайного порядка выполнения операций нескольких потоков над общими данными. Пример — два потока выполняют `counter++`, и одно увеличение теряется.
:::

:::spoiler Что такое deadlock и как его избежать?
Два (и более) потока ждут замки друг друга и никогда не продолжат. Избегают единым порядком захвата замков, минимальным числом замков, таймаутами (`TryEnter`) и отказом от общего изменяемого состояния.
:::

:::spoiler Чем `lock` отличается от `SemaphoreSlim`? (ловушка: «одно и то же»)
`lock` пускает одного и привязан к потоку, внутри нельзя `await`. `SemaphoreSlim(N)` пускает до N участников, поддерживает асинхронное ожидание (`WaitAsync`) и не привязан к потоку.
:::

:::spoiler Достаточно ли `ConcurrentDictionary`, чтобы код был потокобезопасным? (ловушка)
Нет. Каждая отдельная операция потокобезопасна, но последовательность из нескольких (проверить, затем записать) — нет. Нужны атомарные методы (`GetOrAdd`, `AddOrUpdate`, `TryUpdate`), и помни, что фабрика может выполниться несколько раз.
:::

:::spoiler Когда `Interlocked` лучше `lock`?
Когда нужно атомарно изменить одно число или ссылку (счётчик, максимум, флаг): `Interlocked` быстрее и не блокирует потоки. Для изменения нескольких связанных значений нужен `lock`.
:::

:::spoiler Как ограничить число одновременных обращений к внешнему сервису?
`SemaphoreSlim(N)` с `WaitAsync`/`Release` в `finally` либо `Parallel.ForEachAsync` с `MaxDegreeOfParallelism`.
:::

## Что запомнить

- Гонка возникает, когда несколько потоков меняют общее состояние; `counter++` — три шага, и увеличения теряются.
- Порядок выбора: не делить состояние → неизменяемые данные → `Interlocked` → `lock`/`SemaphoreSlim` → потокобезопасные коллекции.
- `lock` — для коротких синхронных секций, приватный объект (лучше `Lock`), без ввода-вывода; `await` внутри запрещён.
- `SemaphoreSlim`: `WaitAsync` + `Release` в `finally`; `SemaphoreSlim(1)` — асинхронный замок; N пропусков ограничивают параллелизм.
- Несколько замков — всегда в одном порядке, иначе deadlock.
- `Concurrent*` защищают отдельные операции, но не составные; фабрика `GetOrAdd` может выполниться несколько раз (`Lazy<T>`).
- `lock` не защищает данные между несколькими экземплярами приложения — для общих данных нужна база.

## Практика

- [ ] Воспроизвёл гонку со счётчиком и исправил тремя способами
- [ ] Ограничил параллельные вызовы `SemaphoreSlim` и измерил время для 1, 3 и 10 «пропусков»
- [ ] Проверил свои синглтоны в проекте: есть ли у них изменяемое состояние без защиты

@@page id="p5-background" phase="5" kind="topic" title="Фоновые задачи: BackgroundService и Channels" nav="Фоновые задачи" est="~1 неделя"
:::why
Не всё нужно делать, пока клиент ждёт ответа: отправка писем, обработка загруженных файлов, напоминания о дедлайнах. Фоновая обработка делает API отзывчивым и устойчивым. Это прямая часть проекта фазы.
:::

## Зачем это нужно

Представь эндпоинт «назначить задачу исполнителю». Само назначение — одна запись в базу, десяток миллисекунд. Но после него нужно отправить исполнителю письмо, а SMTP-сервер отвечает то за 300 мс, то за три секунды, а иногда вообще не отвечает. Если отправлять письмо прямо в обработчике, клиент ждёт чужой сервер; при его сбое запрос падает, хотя задача уже назначена; при нагрузке потоки накапливаются в ожидании. Правильное решение: обработчик быстро выполняет главное, кладёт «письмо» в очередь и отвечает `202 Accepted`, а отдельный фоновый воркер разбирает очередь, повторяет попытки и пишет ошибки в журнал.

То же относится к ночному пересчёту отчётов, напоминаниям о дедлайнах, обработке загруженных файлов, очистке старых данных — всему, что не должно держать пользователя у экрана или должно происходить по расписанию. Фоновые службы — это часть проекта Фазы 5, и по ним задают типичные вопросы собеседований: «как выполнить периодическую задачу в ASP.NET Core?», «почему нельзя внедрить `DbContext` в `BackgroundService`?», «что произойдёт при необработанном исключении в воркере?», «что случится с очередью при перезапуске?».

Что ты получишь от темы:

- научишься строить связку «эндпоинт → очередь → воркер»;
- поймёшь, как хост запускает и корректно останавливает фоновые службы;
- сможешь написать периодическую задачу без дрейфа и наложения запусков;
- будешь знать ограничения очереди в памяти и когда пора переходить к внешней очереди.

Все утверждения проверены запуском: настоящий сервер, настоящий хост и канал `Channel<T>`.

## Интуиция и аналогия

**Заказ в кафе.** Кассир принимает заказ, пробивает чек и сразу отвечает клиенту «ваш заказ принят» — он не стоит у плиты. Заказ попадает на кухню в очередь, повар берёт их по одному. Если кухня занята, очередь растёт; если очередь слишком длинная, кассир перестаёт принимать заказы или просит подождать (это backpressure). Если кафе закрывается, повар заканчивает текущее блюдо и расходится: что не приготовлено, не приготовлено.

**Будильник и расписание.** Периодическая задача — это будильник «каждые 10 минут». Хороший будильник не звонит повторно, пока ты ещё не закончил предыдущее дело, и не копит пропущенные звонки в пачку.

**Бригада на смене.** Хост — бригадир: утром запускает все фоновые службы (`StartAsync`), вечером просит их завершить работу (`StopAsync`) и ждёт ограниченное время. Если один работник падает посреди смены, бригадир по умолчанию останавливает всю смену.

## Основная теория по шагам

### Шаг 1. Идея: очередь внутри приложения

~~~text
 HTTP POST /tasks/42/remind ──▶ эндпоинт кладёт задание в очередь ──▶ 202 Accepted (сразу)
                                          │
                                          ▼
                     BackgroundService читает очередь и выполняет задание
                     (отправка письма, ретраи, логирование ошибок)
~~~

`Channel<T>` — потокобезопасная асинхронная очередь «производитель → потребитель» из .NET. `BackgroundService` — долгоживущая задача, которую хост запускает при старте и корректно останавливает при завершении приложения.

### Шаг 2. `Channel<T>`: очередь с ожиданием и ограничением

Начнём с самого канала, без сервера. Ограниченный канал на два места: пока есть место, запись проходит; когда места нет, `TryWrite` отвечает `false`, а `WriteAsync` **асинхронно ждёт**, пока потребитель освободит место. Это и есть backpressure — «давление назад»: быстрый производитель не может утопить медленного потребителя.

~~~csharp
using System.Threading.Channels;

var channel = Channel.CreateBounded<int>(2);

Console.WriteLine($"TryWrite: {channel.Writer.TryWrite(1)}, {channel.Writer.TryWrite(2)}, {channel.Writer.TryWrite(3)}");   // место закончилось

var pending = channel.Writer.WriteAsync(3).AsTask();
await Task.Delay(50);
Console.WriteLine($"WriteAsync ждёт места: {!pending.IsCompleted}");

Console.WriteLine($"Потребитель прочитал: {await channel.Reader.ReadAsync()}");
await pending;
Console.WriteLine($"Место освободилось, WriteAsync завершился: {pending.IsCompletedSuccessfully}");

channel.Writer.Complete();                                // «больше записей не будет»
var rest = new List<int>();
await foreach (var x in channel.Reader.ReadAllAsync()) rest.Add(x);
Console.WriteLine($"Остаток в порядке записи (FIFO): {string.Join(", ", rest)}; цикл ReadAllAsync завершился сам");

// несколько потребителей делят очередь: каждое задание достаётся ровно одному
var shared = Channel.CreateUnbounded<int>();
for (int i = 1; i <= 10; i++) shared.Writer.TryWrite(i);
shared.Writer.Complete();
var got = new System.Collections.Concurrent.ConcurrentBag<int>();
Task Consumer() => Task.Run(async () => { await foreach (var x in shared.Reader.ReadAllAsync()) got.Add(x); });
await Task.WhenAll(Consumer(), Consumer());
Console.WriteLine($"Два потребителя обработали {got.Count} заданий, повторов нет: {got.Distinct().Count() == got.Count}");
~~~
~~~console
TryWrite: True, True, False
WriteAsync ждёт места: True
Потребитель прочитал: 1
Место освободилось, WriteAsync завершился: True
Остаток в порядке записи (FIFO): 2, 3; цикл ReadAllAsync завершился сам
Два потребителя обработали 10 заданий, повторов нет: True
~~~

`Channel.CreateUnbounded` не ограничивает размер: при медленном потребителе очередь растёт до исчерпания памяти. Для рабочих очередей почти всегда нужен ограниченный канал с политикой `BoundedChannelFullMode.Wait` (подождать), `DropOldest` или `DropWrite` (выбросить задание) — зависит от того, что допустимо потерять.

### Шаг 3. Эндпоинт + воркер: полный пример

Теперь соберём всё вместе и запустим на настоящем сервере: эндпоинт кладёт задания в канал и отвечает сразу, воркер разбирает их по одному, для каждого создаёт свой scope, а задание «bad» намеренно падает. Мы увидим, что ответы приходят раньше, чем задания обработаны, что порядок сохраняется и что один сбой не останавливает воркер.

~~~csharp
using System.Collections.Concurrent;
using System.Threading.Channels;

var builder = WebApplication.CreateBuilder();
builder.WebHost.UseUrls("http://127.0.0.1:0");
builder.Logging.ClearProviders();
builder.Services.AddSingleton(Channel.CreateBounded<EmailJob>(new BoundedChannelOptions(100)
{
    FullMode = BoundedChannelFullMode.Wait,        // очередь полна → производитель подождёт (backpressure)
}));
builder.Services.AddSingleton<Report>();
builder.Services.AddScoped<IEmailSender, FakeEmailSender>();
builder.Services.AddHostedService<EmailWorker>();

var app = builder.Build();
app.MapGet("/ping", () => "pong");
app.MapPost("/api/notify", async (EmailJob job, Channel<EmailJob> channel, CancellationToken ct) =>
{
    await channel.Writer.WriteAsync(job, ct);
    return Results.Accepted();
});

await app.StartAsync();
using var http = new HttpClient { BaseAddress = new Uri(app.Urls.First()) };
await http.GetStringAsync("/ping");                                   // прогрев
var report = app.Services.GetRequiredService<Report>();

var statuses = new List<int>();
foreach (var to in new[] { "a", "b", "bad", "c", "d" })
{
    var response = await http.PostAsJsonAsync("/api/notify", new EmailJob(to, "Напоминание"));
    statuses.Add((int)response.StatusCode);
}
Console.WriteLine($"Коды ответов: {string.Join(", ", statuses.Distinct())}; к этому моменту обработаны не все задания: {report.Done < 5}");

var waited = 0;
while (report.Done < 5 && waited++ < 250) await Task.Delay(20);

Console.WriteLine($"Отправлено по порядку: {string.Join(", ", report.Sent)}");
Console.WriteLine($"Ошибок: {report.Failed}, но воркер работал дальше и обработал остальные: {report.Sent.Count == 4}");
Console.WriteLine($"Разных scope (по одному на задание): {report.Scopes.Count}");
await app.StopAsync();

public sealed record EmailJob(string To, string Subject);

public sealed class Report
{
    public ConcurrentQueue<string> Sent { get; } = new();
    public ConcurrentDictionary<Guid, bool> Scopes { get; } = new();
    private int _failed;
    public int Failed => Volatile.Read(ref _failed);
    public void Fail() => Interlocked.Increment(ref _failed);
    public int Done => Sent.Count + Failed;
}

public interface IEmailSender
{
    Task SendAsync(EmailJob job, CancellationToken ct);
}

public sealed class FakeEmailSender(Report report) : IEmailSender
{
    private readonly Guid _id = Guid.NewGuid();            // у каждого scope свой экземпляр отправителя
    public async Task SendAsync(EmailJob job, CancellationToken ct)
    {
        report.Scopes[_id] = true;
        await Task.Delay(150, ct);                         // имитация SMTP
        if (job.To == "bad") throw new InvalidOperationException("SMTP недоступен");
        report.Sent.Enqueue(job.To);
    }
}

public sealed class EmailWorker(Channel<EmailJob> channel, IServiceScopeFactory scopes, Report report, ILogger<EmailWorker> log) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await foreach (var job in channel.Reader.ReadAllAsync(stoppingToken))
        {
            try
            {
                using var scope = scopes.CreateScope();          // свой scope на каждое задание
                var sender = scope.ServiceProvider.GetRequiredService<IEmailSender>();
                await sender.SendAsync(job, stoppingToken);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                report.Fail();
                log.LogError(ex, "Не удалось отправить письмо {To}", job.To);   // один сбой не останавливает воркер
            }
        }
    }
}
~~~
~~~console
Коды ответов: 202; к этому моменту обработаны не все задания: True
Отправлено по порядку: a, b, c, d
Ошибок: 1, но воркер работал дальше и обработал остальные: True
Разных scope (по одному на задание): 5
~~~

Ключевые моменты:

- `BackgroundService` — **синглтон**. Scoped-сервисы (`DbContext`, отправитель с зависимостями) берём через `IServiceScopeFactory` на каждое задание — это [правило lifetimes из Фазы 4](#p4-di/bugs).
- `try/catch` вокруг одного задания: необработанное исключение остановит весь воркер (а по умолчанию и приложение — проверим ниже).
- `stoppingToken` срабатывает при остановке приложения — цикл завершается корректно.
- Очередь **в памяти**: при перезапуске приложения незавершённые задания теряются (это тоже проверим).

### Шаг 4. Жизненный цикл: запуск, остановка, падение

Хост запускает каждую `IHostedService` при `StartAsync` и останавливает при `StopAsync`. У `BackgroundService` метод `ExecuteAsync` получает `stoppingToken`, который срабатывает при остановке. Корректный воркер этот токен передаёт во все ожидания и выходит из цикла по отмене. Проверим на настоящем хосте:

~~~csharp
using Microsoft.Extensions.Hosting;

var builder = Host.CreateApplicationBuilder();
builder.Logging.ClearProviders();
builder.Services.AddSingleton<LoopWorker>();
builder.Services.AddHostedService(sp => sp.GetRequiredService<LoopWorker>());
using var host = builder.Build();

var worker = host.Services.GetRequiredService<LoopWorker>();
await host.StartAsync();
await Task.Delay(100);
Console.WriteLine($"Воркер работает, тиков: {(worker.Ticks > 0 ? "есть" : "нет")}, задача завершена: {worker.ExecuteTask!.IsCompleted}");

await host.StopAsync();                                   // как Ctrl+C или остановка контейнера
Console.WriteLine($"После StopAsync: воркер увидел отмену и вышел сам: {worker.SawCancellation}, задача завершена: {worker.ExecuteTask.IsCompleted}");

sealed class LoopWorker : BackgroundService
{
    public int Ticks;
    public bool SawCancellation;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try
        {
            while (true)
            {
                await Task.Delay(20, stoppingToken);          // токен прерывает ожидание сразу
                Ticks++;
            }
        }
        catch (OperationCanceledException)
        {
            SawCancellation = true;                           // здесь можно доделать текущую работу и освободить ресурсы
        }
    }
}
~~~
~~~console
Воркер работает, тиков: есть, задача завершена: False
После StopAsync: воркер увидел отмену и вышел сам: True, задача завершена: True
~~~

А теперь самое важное: что будет, если исключение вылетит из `ExecuteAsync`. Поведение задаёт `HostOptions.BackgroundServiceExceptionBehavior`: по умолчанию `StopHost` — хост останавливает **всё приложение**; можно выбрать `Ignore`, тогда воркер просто «умирает», а приложение живёт дальше (и никто не замечает, что фоновая работа не идёт).

~~~csharp
using Microsoft.Extensions.Hosting;

foreach (var behavior in new[] { BackgroundServiceExceptionBehavior.StopHost, BackgroundServiceExceptionBehavior.Ignore })
{
    var builder = Host.CreateApplicationBuilder();
    builder.Logging.ClearProviders();
    builder.Services.Configure<HostOptions>(o => o.BackgroundServiceExceptionBehavior = behavior);
    builder.Services.AddHostedService<CrashWorker>();
    using var host = builder.Build();

    bool stopping = false;
    host.Services.GetRequiredService<IHostApplicationLifetime>().ApplicationStopping.Register(() => stopping = true);

    await host.StartAsync();
    await Task.Delay(300);                                   // воркер упал через 30 мс
    Console.WriteLine($"{behavior,-8}: приложение получило сигнал остановки: {stopping}");
    await host.StopAsync();
}

sealed class CrashWorker : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await Task.Delay(30, stoppingToken);
        throw new InvalidOperationException("упал");
    }
}
~~~
~~~console
StopHost: приложение получило сигнал остановки: True
Ignore  : приложение получило сигнал остановки: False
~~~

Вывод: исключение в воркере — это либо остановка всего приложения, либо тихая смерть фоновой работы. Оба варианта плохи, поэтому цикл обработки одного задания всегда оборачивают в `try/catch` (как в нашем `EmailWorker`), а ошибки пишут в журнал.

### Шаг 5. Запуск хоста и синхронная часть `ExecuteAsync`

Хост запускает службы по очереди и ждёт, пока каждая вернёт управление из `StartAsync`. В старых версиях .NET (по документации — до .NET 10) `BackgroundService.StartAsync` вызывал `ExecuteAsync` синхронно, и долгая работа в начале метода до первого `await` задерживала запуск всех остальных служб и самого приложения. Проверим, как ведёт себя .NET 10, на которой мы работаем:

~~~csharp
using System.Diagnostics;
using Microsoft.Extensions.Hosting;

foreach (var yieldFirst in new[] { false, true })
{
    var builder = Host.CreateApplicationBuilder();
    builder.Logging.ClearProviders();
    builder.Services.AddHostedService(_ => new HeavyStartWorker(yieldFirst));
    using var host = builder.Build();

    var sw = Stopwatch.StartNew();
    await host.StartAsync();
    var startup = sw.ElapsedMilliseconds;
    Console.WriteLine($"Task.Yield в начале: {yieldFirst,-5} → StartAsync дождался синхронной части (≥ 250 мс): {startup >= 250}");
    await host.StopAsync();
}

sealed class HeavyStartWorker(bool yieldFirst) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (yieldFirst) await Task.Yield();
        Thread.Sleep(300);                                   // долгая синхронная подготовка (чтение файла, прогрев кэша)
        await Task.Delay(10, stoppingToken);
    }
}
~~~
~~~console
Task.Yield в начале: False → StartAsync дождался синхронной части (≥ 250 мс): False
Task.Yield в начале: True  → StartAsync дождался синхронной части (≥ 250 мс): False
~~~

В .NET 10 синхронная часть `ExecuteAsync` запуск **не задерживает** (в обоих вариантах `StartAsync` вернулся быстро): `ExecuteAsync` теперь выполняется как задача целиком. В проектах на .NET 8 и 9 это не так, и там привычка начинать метод с `await Task.Yield()` защищает от блокировки запуска; на .NET 10 она безвредна. Мы поведение старых версий не запускали и опираемся на документацию. Но и на .NET 10 долгая синхронная работа в начале метода занимает поток пула — подготовку лучше делать асинхронно.

### Шаг 6. Scoped-сервис в конструкторе воркера

`BackgroundService` — синглтон, а `DbContext` — scoped. Если взять `DbContext` в конструктор воркера, он проживёт всё время работы приложения (captive dependency, см. [DI](#p4-di)). В окружении `Development` контейнер ловит эту ошибку при построении хоста:

~~~csharp
using Microsoft.Extensions.Hosting;

var builder = Host.CreateApplicationBuilder(new HostApplicationBuilderSettings { EnvironmentName = "Development" });
builder.Logging.ClearProviders();
builder.Services.AddScoped<FakeDbContext>();
builder.Services.AddHostedService<BadWorker>();

try
{
    using var host = builder.Build();
    Console.WriteLine("Хост построен");
}
catch (Exception e)
{
    Console.WriteLine($"{e.GetType().Name}: ошибка про scoped в singleton: {e.Message.Contains("Cannot consume scoped service")}");
}

sealed class FakeDbContext { }
sealed class BadWorker(FakeDbContext db) : BackgroundService
{
    protected override Task ExecuteAsync(CancellationToken stoppingToken) => Task.CompletedTask;
}
~~~
~~~console
AggregateException: ошибка про scoped в singleton: True
~~~

Без проверки (в `Production` она выключена) сервис молча создастся один раз и «зависнет» в памяти на всю жизнь приложения; с `DbContext` это даёт устаревшие данные, рост трекера и ошибки конкурентности.

### Шаг 7. Периодическая задача: `PeriodicTimer`

~~~csharp Напоминания о просроченных задачах раз в 10 минут @nocheck
public sealed class OverdueReminderWorker(IServiceScopeFactory scopes, ILogger<OverdueReminderWorker> log) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromMinutes(10));
        while (await timer.WaitForNextTickAsync(stoppingToken))
        {
            try
            {
                using var scope = scopes.CreateScope();
                var reminders = scope.ServiceProvider.GetRequiredService<IReminderService>();
                int sent = await reminders.SendOverdueAsync(stoppingToken);
                log.LogInformation("Отправлено напоминаний: {Count}", sent);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                log.LogError(ex, "Ошибка при отправке напоминаний");
            }
        }
    }
}

public interface IReminderService
{
    Task<int> SendOverdueAsync(CancellationToken ct);
}
~~~

Чем `PeriodicTimer` лучше `System.Threading.Timer` и цикла `while + Task.Delay`? Он не запускает обработчик повторно, пока тот не закончил: тики не накладываются друг на друга. Покажем разницу: обработчик занимает 80 мс при периоде 30 мс:

~~~csharp
// 1. Старый Timer: каждые 30 мс запускает обработчик, не дожидаясь предыдущего
int current = 0, maxConcurrentTimer = 0;
using (var timer = new Timer(_ =>
{
    int now = Interlocked.Increment(ref current);
    int seen;
    while (now > (seen = Volatile.Read(ref maxConcurrentTimer)) && Interlocked.CompareExchange(ref maxConcurrentTimer, now, seen) != seen) { }
    Thread.Sleep(80);
    Interlocked.Decrement(ref current);
}, null, 30, 30))
{
    await Task.Delay(300);
}
await Task.Delay(200);                                   // дать обработчикам закончить
Console.WriteLine($"Timer: обработчики накладывались друг на друга: {maxConcurrentTimer > 1}");

// 2. PeriodicTimer: цикл «ждёт тик → обрабатывает» не перекрывается
int currentPeriodic = 0, maxConcurrentPeriodic = 0, handled = 0;
using var cts = new CancellationTokenSource(300);
using var periodic = new PeriodicTimer(TimeSpan.FromMilliseconds(30));
try
{
    while (await periodic.WaitForNextTickAsync(cts.Token))
    {
        int now = Interlocked.Increment(ref currentPeriodic);
        maxConcurrentPeriodic = Math.Max(maxConcurrentPeriodic, now);
        await Task.Delay(80);
        Interlocked.Decrement(ref currentPeriodic);
        handled++;
    }
}
catch (OperationCanceledException) { }
Console.WriteLine($"PeriodicTimer: одновременно обрабатывалось не больше {maxConcurrentPeriodic}; запусков за 300 мс меньше, чем «по расписанию» (10): {handled < 10}");
~~~
~~~console
Timer: обработчики накладывались друг на друга: True
PeriodicTimer: одновременно обрабатывалось не больше 1; запусков за 300 мс меньше, чем «по расписанию» (10): True
~~~


### Шаг 8. Что теряется при остановке: очередь в памяти

Очередь живёт в памяти процесса. Что происходит с заданиями, которые не успели обработать, когда приложение останавливается? Они исчезают вместе с процессом. Посмотрим:

~~~csharp
using System.Threading.Channels;
using Microsoft.Extensions.Hosting;

var builder = Host.CreateApplicationBuilder();
builder.Logging.ClearProviders();
var channel = Channel.CreateBounded<int>(100);
var processed = new List<int>();
builder.Services.AddSingleton(channel);
builder.Services.AddSingleton(processed);
builder.Services.AddHostedService<SlowWorker>();
using var host = builder.Build();

await host.StartAsync();
for (int i = 1; i <= 10; i++) channel.Writer.TryWrite(i);
await Task.Delay(250);                                        // воркер успел обработать пару заданий (по 100 мс)
await host.StopAsync();

Console.WriteLine($"Обработано до остановки: меньше 10: {processed.Count < 10}");
Console.WriteLine($"Осталось в очереди и будет потеряно при выходе: больше нуля: {channel.Reader.Count > 0}");

sealed class SlowWorker(Channel<int> channel, List<int> processed) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try
        {
            await foreach (var job in channel.Reader.ReadAllAsync(stoppingToken))
            {
                await Task.Delay(100, stoppingToken);
                processed.Add(job);
            }
        }
        catch (OperationCanceledException) { }
    }
}
~~~
~~~console
Обработано до остановки: меньше 10: True
Осталось в очереди и будет потеряно при выходе: больше нуля: True
~~~

:::warn Когда очереди в памяти мало
Если задания нельзя терять (платежи, важные письма) или экземпляров приложения несколько, нужна **внешняя** очередь (RabbitMQ, Azure Service Bus) или «outbox»-таблица в базе, которую воркер разбирает. Для учебного проекта очереди в памяти достаточно — просто честно опиши ограничение в README.
:::

## Как это работает под капотом

- **`IHostedService` и `BackgroundService`.** `IHostedService` — интерфейс с двумя методами: `StartAsync` и `StopAsync`. `BackgroundService` — готовая абстрактная реализация: в `StartAsync` она вызывает ваш `ExecuteAsync(stoppingToken)` и сохраняет возвращённую задачу в `ExecuteTask`; в `StopAsync` отменяет токен и ждёт завершения этой задачи, но не дольше, чем `HostOptions.ShutdownTimeout`.
- **Что делает хост при остановке.** По `Ctrl+C` или `SIGTERM` (остановка контейнера) срабатывает `IHostApplicationLifetime.ApplicationStopping`, хост останавливает службы в обратном порядке регистрации, у каждой вызывает `StopAsync`. Если служба не уложилась в таймаут, хост перестаёт ждать — процесс завершится, а недоделанная работа прервётся.
- **Как устроен `Channel<T>`.** Внутри — очередь и набор ожидающих читателей и писателей. `WriteAsync` на полном ограниченном канале возвращает незавершённую задачу и запоминает ожидающего писателя; `ReadAsync` на пустом — незавершённую задачу читателя. Поэтому ожидание не занимает потоков — это та же модель из темы про [async/await](#p5-async). Канал потокобезопасен для любого числа писателей и читателей; параметры `SingleReader`/`SingleWriter` позволяют включить более быстрые реализации, если это правда.
- **Что значит `Complete()`.** Писатель сообщает, что записей больше не будет; читатели дочитывают остаток и `ReadAllAsync` завершается. Без `Complete` цикл ждёт новых заданий вечно (до отмены токена).
- **Откуда берётся 202.** `Results.Accepted()` — просто статус «принято к обработке»: результата ещё нет. Если клиенту нужен итог, возвращают идентификатор задания (в теле или в заголовке `Location`), а клиент опрашивает статус.
- **Почему `PeriodicTimer` не накладывается.** Таймер хранит не «обработчик», а флаг «тик наступил»: `WaitForNextTickAsync` возвращает задачу, которая завершается при наступлении тика. Пока цикл занят обработкой, пропущенные тики не копятся в пачку — потребитель получит не больше одного ожидающего тика. Цикл по определению не перекрывается сам с собой. Старый `Timer` вызывает обратный вызов на потоке пула независимо от предыдущих запусков — отсюда наложения.
- **Расписание «в 03:00 каждую ночь».** `PeriodicTimer` задаёт интервал, а не время суток. Для расписаний по часам используют вычисление задержки до ближайшего запуска или готовые библиотеки (Quartz.NET, Hangfire) — они хранят задания и умеют повторять их после перезапуска.
- **Зачем scope на задание.** `DbContext` не потокобезопасен и накапливает отслеживаемые сущности; долгоживущий экземпляр раздувается и устаревает. Поэтому на каждую единицу работы создаётся короткоживущий scope — ровно как это делает ASP.NET Core на каждый HTTP-запрос.
- **Что делает ограниченный канал при заполнении.** По умолчанию — `Wait`: писатель ждёт. Для HTTP-эндпоинта это означает, что при переполнении очереди запросы начнут «висеть» (до таймаута клиента); поэтому границу выбирают осознанно и при необходимости используют `TryWrite` и отвечают `503`/`429`.

## Типичные ошибки и ловушки

- **`DbContext` и другие scoped-сервисы в конструкторе воркера.** Captive dependency; нужен `IServiceScopeFactory` и scope на каждое задание.
- **Нет `try/catch` вокруг обработки одного задания.** Одно исключение останавливает воркер или даже всё приложение.
- **Игнорирование `stoppingToken`.** Воркер не останавливается вовремя, контейнер получает `SIGKILL`.
- **`Thread.Sleep` и синхронные блокировки внутри воркера.** Занимают поток пула; используй `await Task.Delay(…, stoppingToken)`.
- **Неограниченная очередь.** При медленном потребителе память растёт до падения.
- **Потеря заданий при перезапуске.** Очередь в памяти не переживает процесс; важное — во внешнюю очередь или в outbox-таблицу.
- **Fire-and-forget `Task.Run` или `_ = SendAsync()` в обработчике запроса.** Исключения теряются, `DbContext` уже освобождён, остановка приложения не ждёт такую работу. Используй очередь и воркер.
- **`Timer` вместо `PeriodicTimer`** с долгим обработчиком: запуски накладываются.
- **Обработчик периодической задачи дольше интервала** и без защиты от пересечения нескольких экземпляров приложения: два экземпляра выполнят задачу дважды. Нужна распределённая блокировка или единственный исполнитель.
- **Нет идемпотентности.** При повторах (ретраи, перезапуск) письмо уйдёт дважды; делай обработку безопасной к повтору.
- **Нет журналирования идентификатора задания.** Невозможно проследить судьбу конкретного задания.
- **Тяжёлая синхронная работа в начале `ExecuteAsync`.** В .NET 8/9 она блокирует запуск остальных служб (ставь `await Task.Yield()` в начале), в .NET 10 не блокирует (проверено), но занимает поток пула.
- **Время ожидания остановки меньше длительности задания.** Прерванная посередине работа должна быть безопасной.

## Вопросы с собеседований

:::spoiler Почему в BackgroundService нельзя взять DbContext в конструктор?
`BackgroundService` регистрируется как синглтон и живёт всё время работы приложения, а `DbContext` — scoped. Получится captive dependency. Нужно создавать scope на каждую единицу работы через `IServiceScopeFactory`.
:::

:::spoiler Что будет, если не ловить исключения внутри цикла воркера?
Исключение завершит `ExecuteAsync`; в современных версиях .NET по умолчанию это останавливает приложение (`BackgroundServiceExceptionBehavior.StopHost`). Ошибка одного задания не должна убивать обработку остальных.
:::

:::spoiler Зачем ограниченный (bounded) канал?
Чтобы очередь не росла бесконечно при медленном потребителе: при заполнении производитель ждёт (backpressure) вместо исчерпания памяти.
:::

:::spoiler Как выполнять периодическую задачу в ASP.NET Core?
`BackgroundService` с циклом `while (await timer.WaitForNextTickAsync(stoppingToken))` на `PeriodicTimer`; внутри — scope на итерацию и `try/catch`. Для расписаний по часам и устойчивости к перезапуску — Quartz.NET или Hangfire.
:::

:::spoiler Что произойдёт с заданиями в очереди при перезапуске приложения? (ловушка: «они сохранятся в канале»)
Они потеряются: `Channel<T>` живёт в памяти процесса. Для важных заданий нужна внешняя очередь или outbox-таблица в базе.
:::

:::spoiler Зачем эндпоинт возвращает 202 Accepted, а не 200 OK?
Потому что работа ещё не сделана — задание только принято в очередь. Результат клиент получит позже (опросом статуса, уведомлением).
:::

:::spoiler Чем `BackgroundService` отличается от `IHostedService`?
`IHostedService` — низкоуровневый интерфейс (`StartAsync`/`StopAsync`). `BackgroundService` — готовый базовый класс, который запускает `ExecuteAsync` и при остановке отменяет токен и ждёт завершения задачи.
:::

:::spoiler Почему `PeriodicTimer` лучше `Timer` для периодических задач с async-обработчиком?
Он используется в цикле `await WaitForNextTickAsync`, и обработчик не перекрывается сам с собой; ожидание асинхронное, потоки не занимаются, отмена передаётся токеном.
:::

## Что запомнить

- Долгое и ненадёжное (письма, файлы, пересчёты) выносят из запроса: эндпоинт кладёт задание в очередь и отвечает `202`, воркер разбирает очередь.
- `Channel<T>` — асинхронная потокобезопасная очередь; ограниченный канал даёт backpressure (`WriteAsync` ждёт, `TryWrite` отвечает `false`).
- `BackgroundService` — синглтон: scoped-сервисы бери через `IServiceScopeFactory` на каждое задание.
- Оборачивай обработку одного задания в `try/catch` и передавай `stoppingToken` во все ожидания; необработанное исключение останавливает приложение (по умолчанию).
- Периодические задачи — `PeriodicTimer`; он не накладывает запуски друг на друга.
- Очередь в памяти теряется при перезапуске; для критичных заданий — внешняя очередь или outbox.
- Остановка корректна только если воркер уважает токен и укладывается в `ShutdownTimeout`.

## Практика

- [ ] Поднял пример, отправил 20 заданий подряд и посмотрел в логах, как воркер их разбирает
- [ ] Добавил в проект фоновую отправку уведомлений при назначении задачи
- [ ] Добавил периодическую задачу напоминаний о просроченных задачах с `PeriodicTimer`
- [ ] Проверил корректную остановку: Ctrl+C во время обработки — воркер завершается без ошибок

