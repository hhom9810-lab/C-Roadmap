@@ref id="as-task" cat="F" title="Task и Task<T>" cs="5.0" cx="O(1)" mem="O(1)" tags="Task Task<T> Task.Run Task.FromResult Task.CompletedTask задача состояние Status IsCompleted продолжение ContinueWith горячая задача" topic="p5-async" related="as-async-await,as-whenall,as-exceptions,as-valuetask" learn="dotnet/standard/asynchronous-programming-patterns/task-based-asynchronous-pattern-tap::Асинхронный шаблон на основе задач (TAP)"
`Task` — объект, представляющий операцию, которая выполняется или уже завершилась; `Task<T>` дополнительно хранит результат. Это «обещание» значения или завершения.

## Синтаксис {#syntax}

~~~csharp @nocheck
Task t = DoAsync();                         // уже запущена
Task<int> r = ComputeAsync();
int v = await r;
Task done = Task.CompletedTask;
Task<int> c = Task.FromResult(42);
Task bg = Task.Run(() => HeavyWork());      // выполнить на пуле потоков
~~~

## Семантика {#semantics}

- Возврат из `async`-метода отдаёт **горячую** задачу: операция уже началась к моменту, когда вы получили `Task`. Холодные «обёртки» нужно создавать явно.
- `Task` не равен потоку: большинство асинхронных операций (ввод-вывод, таймеры) не занимают поток, пока ждут.
- Состояния: `Created`, `WaitingForActivation`, `Running`, `RanToCompletion`, `Faulted`, `Canceled`. Проверять свойства вроде `IsCompleted` нужно редко: используйте `await`.
- `Task.Run(...)` ставит делегат в очередь пула потоков — для CPU-нагрузки; для ввода-вывода оборачивать синхронный код в `Task.Run` бессмысленно на сервере (занимаете поток).
- `Task.FromResult` и `Task.CompletedTask` возвращают уже завершённые задачи без аллокации (кэшируются) — используйте в методах-заглушках и для синхронных ветвей.
- Результат `Task<T>.Result` и `Task.Wait()` блокируют поток и могут привести к взаимной блокировке ([sync over async](#/ref/f/as-deadlock)). Используйте `await`.
- Задача может быть ожидаема многократно из нескольких мест; результат кэшируется.
- Исключение сохраняется внутри задачи и выбрасывается при `await`/`Wait()`/`Result` ([исключения](#/ref/f/as-exceptions)).
- Не создавайте задачи через конструктор `new Task(...)` — это холодная задача, которую нужно запускать вручную; почти никогда не нужно.
- Продолжения `ContinueWith` в современном коде заменяйте на `await`.

## Под капотом {#internals}

`Task` — класс с полем состояния, результатом, исключением и списком продолжений. Завершение вызывает продолжения. `Task.Run` помещает работу в очередь `ThreadPool`; пул масштабируется алгоритмом hill-climbing.

## Сложность {#complexity}

Создание задачи — аллокация объекта (~60–100 байт); для частых синхронных ветвей используйте `ValueTask` или кэшированные задачи.

## Версии {#versions}

- .NET 4.0 — `Task`; C# 5 / .NET 4.5 — `async/await`, `Task.Run`, `Task.FromResult`.
- .NET 4.6 — `Task.CompletedTask`; .NET 6 — `Task.WaitAsync`.

## Ловушки {#pitfalls}

**Задача запускается сразу, а не при `await`.**

~~~csharp
Console.WriteLine("до вызова");
Task<int> t = Compute();                       // работа уже началась
Console.WriteLine("после вызова");
Console.WriteLine(await t);

Task<int> done = Task.FromResult(5);
Console.WriteLine(done.IsCompletedSuccessfully + " " + done.Result);

static async Task<int> Compute()
{
    Console.WriteLine("начали вычисление");
    await Task.Delay(10);
    return 42;
}
~~~
~~~console
до вызова
начали вычисление
после вызова
42
True 5
~~~

**`Task.Run` для ввода-вывода** на сервере тратит поток впустую.

**Блокировка через `.Result`** в UI или ASP.NET-контексте.

**Забытый `await`:** метод продолжается, не дождавшись, исключения теряются.

## Примеры {#examples}

~~~csharp
var t1 = Task.Run(() => { Thread.Sleep(30); return 1; });
var t2 = Task.Run(() => { Thread.Sleep(10); return 2; });
Console.WriteLine(await t1 + await t2);
Console.WriteLine(t1.Status);

Task completed = Task.CompletedTask;
await completed;
Console.WriteLine(completed.IsCompleted);
~~~
~~~console
3
RanToCompletion
True
~~~

@@ref id="as-async-await" cat="F" title="async и await: как это работает" cs="5.0" cx="O(1)" mem="O(1)" tags="async await конечный автомат SynchronizationContext ConfigureAwait продолжение возврат в контекст UI поток TaskScheduler state machine" topic="p5-async,p5-async-pitfalls" related="as-task,as-deadlock,as-valuetask,fl-iterators" learn="?dotnet/csharp/asynchronous-programming/::Асинхронное программирование"
`async` разрешает использовать `await` в методе; `await` приостанавливает метод, не блокируя поток, и возобновляет его, когда ожидаемая операция завершится.

## Синтаксис {#syntax}

~~~csharp @nocheck
async Task<string> LoadAsync(string url)
{
    using var http = new HttpClient();
    string s = await http.GetStringAsync(url);     // метод приостанавливается здесь
    return s.Trim();
}
await Task.Delay(100).ConfigureAwait(false);
async Task Void() { }  /  async void Handler(object s, EventArgs e) { }
~~~

## Семантика {#semantics}

- `async` не создаёт потоков и не делает метод асинхронным сам по себе — он включает `await` и превращает метод в конечный автомат.
- Выполнение идёт **синхронно до первого `await`** на незавершённой операции; затем метод возвращает управление вызывающему (возвращает `Task`), а остаток выполнится позже как продолжение.
- Если ожидаемая задача уже завершена, `await` не приостанавливается, и код продолжается синхронно.
- После `await` код продолжается в **захваченном контексте** (`SynchronizationContext` или `TaskScheduler`): в UI-приложениях — в потоке интерфейса; в ASP.NET Core контекста нет, продолжение идёт в потоке пула.
- `ConfigureAwait(false)` отказывается от возврата в контекст; нужен в библиотеках (чтобы не зависеть от UI), в ASP.NET Core почти не влияет.
- Типы результата: `Task`, `Task<T>`, `ValueTask`, `ValueTask<T>`, `void` (только для обработчиков событий), `IAsyncEnumerable<T>` и собственные.
- Параметры `async`-метода не могут быть `ref`/`out`/`in`; `ref struct` в локалях между `await` запрещены.
- Асинхронность «заразна»: чтобы использовать `await`, метод должен быть `async`, а его вызывающий — ожидать результат; поэтому асинхронным делают весь стек от точки входа (`async Task Main`).
- Не применяйте `async` там, где метод просто возвращает чужую задачу: достаточно `return inner;` — без автомата и накладных расходов (но без `using`/`try` вокруг).
- Именование: асинхронные методы заканчиваются на `Async`.

## Под капотом {#internals}

Компилятор переписывает метод в структуру/класс `IAsyncStateMachine` с полем `state`, локальными переменными и методом `MoveNext`. `await` вызывает `GetAwaiter()`, проверяет `IsCompleted`, а при незавершённости регистрирует продолжение (`OnCompleted`) и выходит. `AsyncTaskMethodBuilder` создаёт и завершает задачу.

## Сложность {#complexity}

Метод, завершившийся синхронно, дёшев; при реальном ожидании аллокации: автомат (боксируется в кучу при первом `await`), задача, делегат продолжения. Для горячих путей используйте `ValueTask`.

## Версии {#versions}

- C# 5 — `async/await`; C# 7 — обобщённые возвращаемые типы (`ValueTask`).
- C# 8 — `await foreach`, `await using`.

## Ловушки {#pitfalls}

**Код до первого `await` выполняется синхронно.**

~~~csharp
Console.WriteLine("1 перед вызовом");
var t = Work();
Console.WriteLine("3 после возврата управления");
await t;

static async Task Work()
{
    Console.WriteLine("2 внутри, до await (синхронно)");
    await Task.Delay(20);
    Console.WriteLine("4 после await");
}
~~~
~~~console
1 перед вызовом
2 внутри, до await (синхронно)
3 после возврата управления
4 после await
~~~

**`async void`** — исключения не поймать, ожидать нельзя.

**Блокировка `.Result` в контексте с одним потоком** — взаимная блокировка.

**Лишний `async`/`await`** в методе-обёртке добавляет автомат ради ничего.

## Примеры {#examples}

~~~csharp
async Task<int> Square(int n) { await Task.Delay(5); return n * n; }

int a = await Square(3);
int b = await Square(4);
Console.WriteLine(a + b);

// запуск параллельно, ожидание позже
var ta = Square(5);
var tb = Square(6);
Console.WriteLine(await ta + await tb);
~~~
~~~console
25
61
~~~

@@ref id="as-valuetask" cat="F" title="ValueTask: когда он нужен" cs="7.0" cx="O(1)" mem="O(1)" tags="ValueTask ValueTask<T> аллокации кэшированный результат IValueTaskSource AsTask единократное ожидание горячий путь" topic="p5-async" related="as-task,as-async-await" learn="dotnet/api/system.threading.tasks.valuetask-1::ValueTask<TResult>"
`ValueTask<T>` — структура вместо класса: если операция завершается синхронно (кэш, буфер), аллокации задачи нет. Это оптимизация для горячих путей, а не замена `Task`.

## Синтаксис {#syntax}

~~~csharp @nocheck
public ValueTask<int> ReadAsync()
{
    if (_buffered > 0) return new ValueTask<int>(_buffered);   // без аллокации
    return new ValueTask<int>(SlowReadAsync());                // обёртка над Task
}
int n = await ReadAsync();
Task<int> t = ReadAsync().AsTask();                            // если нужна задача
~~~

## Семантика {#semantics}

- `ValueTask<T>` содержит либо готовый результат, либо ссылку на `Task<T>`/`IValueTaskSource<T>`. Для синхронного завершения аллокаций нет.
- **Правила использования:** ожидать (`await`) нужно **ровно один раз**; нельзя ожидать параллельно, нельзя вызывать `GetAwaiter().GetResult()` до завершения, нельзя использовать результат после вызова `AsTask`. Если нужно несколько ожиданий, преобразуйте в `Task` один раз через `AsTask()`.
- Применяйте, когда метод **часто** завершается синхронно: чтение из буфера, кэш, быстрый путь. Если операция почти всегда асинхронна — выигрыша нет.
- Для публичных API общего назначения стандартный выбор — `Task<T>`; `ValueTask<T>` — после измерений.
- `async ValueTask<T>` не создаёт задачу при синхронном завершении; с атрибутом `[AsyncMethodBuilder(typeof(PoolingAsyncValueTaskMethodBuilder<>))]` объекты автомата берутся из пула.
- Нельзя сравнивать и использовать `ValueTask` как ключ; для параллельных ожиданий (`WhenAll`) сначала `AsTask()`.
- Нет аналога `Task.FromResult`: просто `new ValueTask<T>(value)` или `ValueTask.FromResult(value)`.
- Типичный пример — потоки и каналы: `Stream.ReadAsync(Memory<byte>)` возвращает `ValueTask<int>`, потому что чаще всего данные уже лежат в буфере и ждать нечего. Для обычного бизнес-кода (запрос к API или БД) операция всегда реально асинхронна, и `Task<T>` проще и безопаснее.
- Если вы подключаете `ValueTask` в интерфейс, помните, что все реализации обязаны следовать тем же правилам единократного ожидания; ошибки проявляются только под нагрузкой.

## Под капотом {#internals}

Структура содержит поле объекта, результат, токен версии и флаг. Для источников на `IValueTaskSource` используется токен, чтобы обнаружить повторное использование. Поэтому неверное применение даёт трудноуловимые ошибки.

## Сложность {#complexity}

Экономит аллокацию (≈ 24–72 байта) на каждый синхронно завершённый вызов; копирование структуры — недорого.

## Версии {#versions}

- .NET Core 2.0 / C# 7 — `ValueTask<T>`; .NET Core 2.1 — `IValueTaskSource`; .NET 5 — `PoolingAsyncValueTaskMethodBuilder`.
- .NET 5 — неуниверсальный `ValueTask`.

## Ловушки {#pitfalls}

**Двойное ожидание `ValueTask`.**

~~~csharp
ValueTask<int> vt = new ValueTask<int>(Task.Run(async () => { await Task.Delay(10); return 7; }));
int a = await vt;                         // первое ожидание — допустимо
Console.WriteLine(a);

ValueTask<int> vt2 = new ValueTask<int>(Task.Run(async () => { await Task.Delay(10); return 8; }));
Task<int> shared = vt2.AsTask();          // ✅ превращаем в Task один раз
Console.WriteLine(await shared + await shared);

ValueTask<int> cached = new ValueTask<int>(99);   // готовый результат без аллокации
Console.WriteLine(cached.IsCompletedSuccessfully + " " + await cached);
~~~
~~~console
7
16
True 99
~~~

**Использование в публичных API по умолчанию** вместо `Task`.

**Ожидание из нескольких мест** — неопределённое поведение.

**Преждевременная оптимизация:** без измерений выигрыша нет.

## Примеры {#examples}

~~~csharp
var cache = new Cache();
Console.WriteLine(await cache.GetAsync("a"));     // загрузка
Console.WriteLine(await cache.GetAsync("a"));     // из кэша — синхронно
Console.WriteLine(cache.Loads);

class Cache
{
    private readonly Dictionary<string, string> _d = new();
    public int Loads;
    public ValueTask<string> GetAsync(string key)
        => _d.TryGetValue(key, out var v) ? new ValueTask<string>(v) : new ValueTask<string>(Load(key));
    private async Task<string> Load(string key) { await Task.Delay(5); Loads++; return _d[key] = key.ToUpper(); }
}
~~~
~~~console
A
A
1
~~~

@@ref id="as-cancellation" cat="F" title="Отмена: CancellationToken" cs="4.0" cx="O(1)" mem="O(1)" tags="CancellationToken CancellationTokenSource Cancel ThrowIfCancellationRequested OperationCanceledException CancelAfter linked token таймаут отмена запроса" topic="p5-async,p5-background" related="as-task,as-whenall,as-exceptions" learn="dotnet/standard/threading/cancellation-in-managed-threads::Отмена в управляемых потоках"
Отмена в .NET кооперативная: источник (`CancellationTokenSource`) подаёт сигнал, а работающий код сам периодически проверяет токен и завершается с `OperationCanceledException`.

## Синтаксис {#syntax}

~~~csharp @nocheck
using var cts = new CancellationTokenSource();
cts.CancelAfter(TimeSpan.FromSeconds(5));
await DoAsync(cts.Token);
async Task DoAsync(CancellationToken ct)
{
    ct.ThrowIfCancellationRequested();
    await Task.Delay(1000, ct);
    while (!ct.IsCancellationRequested) { ... }
}
using var reg = ct.Register(() => Cleanup());
~~~

## Семантика {#semantics}

- `CancellationTokenSource` создаёт токен и инициирует отмену (`Cancel()`, `CancelAfter()`); `CancellationToken` — структура, которую передают в методы, она только читает состояние.
- Токен — **последний параметр** метода по соглашению; почти все асинхронные API BCL принимают его.
- `ThrowIfCancellationRequested()` бросает `OperationCanceledException`; `await` на отменённой задаче выбрасывает его же. Это нормальный сценарий, а не ошибка: ловите его отдельно и не логируйте как сбой.
- Токены можно объединять: `CancellationTokenSource.CreateLinkedTokenSource(a, b)` — отмена по любому из двух (например, таймаут и отмена запроса).
- Отмена не прерывает код принудительно: цикл без проверок токена не остановится. Проверяйте токен между шагами и передавайте его вглубь.
- `CancellationTokenSource` реализует `IDisposable` — освобождайте (`using`), особенно с `CancelAfter` и связанными токенами.
- В ASP.NET Core токен `HttpContext.RequestAborted` и параметр `CancellationToken` в методе контроллера отменяются при разрыве соединения.
- `Register` вызывает обратные вызовы при отмене; освобождайте регистрацию, чтобы не удерживать объекты.
- Для таймаута задач, не поддерживающих токены, используйте `Task.WaitAsync(timeout, ct)` (.NET 6+).
- Хорошая практика — принимать токен в каждом публичном асинхронном методе с необязательным значением `default`, передавать его дальше без изменений и не создавать новый источник, если не нужен собственный таймаут. Тестируйте отмену: создайте уже отменённый токен и убедитесь, что метод быстро завершается и освобождает ресурсы.
- Не забывайте и про «мягкую» остановку фоновых служб: `BackgroundService.ExecuteAsync(CancellationToken stoppingToken)` получает токен при остановке приложения, и цикл должен завершаться при его срабатывании.

## Под капотом {#internals}

Токен ссылается на источник; `Cancel` меняет состояние и синхронно вызывает зарегистрированные обратные вызовы. Асинхронные методы BCL регистрируют отмену и завершают задачу в состоянии `Canceled`.

## Сложность {#complexity}

Проверка токена — чтение флага. Регистрации и источники — небольшие аллокации; тысячи долгоживущих неосвобождённых источников приводят к утечкам.

## Версии {#versions}

- .NET 4.0 — отмена; .NET 4.5 — `CancelAfter`; .NET 6 — `Task.WaitAsync`.

## Ловушки {#pitfalls}

**Токен не передан вглубь — отмена не работает.**

~~~csharp
using var cts = new CancellationTokenSource();
cts.CancelAfter(30);
try { await WorkAsync(cts.Token); }
catch (OperationCanceledException) { Console.WriteLine("отменено"); }

using var cts2 = new CancellationTokenSource(); cts2.Cancel();
Console.WriteLine(cts2.Token.IsCancellationRequested);
try { cts2.Token.ThrowIfCancellationRequested(); }
catch (OperationCanceledException e) { Console.WriteLine(e.CancellationToken == cts2.Token); }

static async Task WorkAsync(CancellationToken ct)
{
    for (int i = 0; i < 100; i++) { await Task.Delay(10, ct); }
}
~~~
~~~console
отменено
True
True
~~~

**Логирование отмены как ошибки** засоряет журналы.

**Забытый `Dispose` источника.**

**Блокирующий вызов без токена** внутри «отменяемого» метода.

## Примеры {#examples}

~~~csharp
using var timeout = new CancellationTokenSource(TimeSpan.FromMilliseconds(40));
using var manual = new CancellationTokenSource();
using var linked = CancellationTokenSource.CreateLinkedTokenSource(timeout.Token, manual.Token);

int steps = 0;
try { while (true) { await Task.Delay(10, linked.Token); steps++; } }
catch (OperationCanceledException) { }
Console.WriteLine(steps >= 1 && steps <= 4);
Console.WriteLine(timeout.IsCancellationRequested + " " + manual.IsCancellationRequested);
~~~
~~~console
True
True False
~~~
