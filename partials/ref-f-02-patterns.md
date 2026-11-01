@@ref id="as-whenall" cat="F" title="WhenAll, WhenAny и параллельное ожидание" cs="5.0" cx="O(n)" mem="O(n)" tags="Task.WhenAll Task.WhenAny WhenEach параллельные запросы таймаут первый завершённый await в цикле последовательно throttling SemaphoreSlim" topic="p5-async" related="as-task,as-exceptions,as-cancellation,as-sync-primitives" learn="dotnet/api/system.threading.tasks.task.whenall::Task.WhenAll"
`Task.WhenAll` ждёт завершения всех задач, `Task.WhenAny` — первой. Запуск нескольких независимых операций и ожидание их вместе выполняется за время самой долгой, а не суммы.

## Синтаксис {#syntax}

~~~csharp @nocheck
var t1 = GetAsync(1);  var t2 = GetAsync(2);       // запускаем обе
int[] r = await Task.WhenAll(t1, t2);               // ждём вместе
var tasks = ids.Select(GetAsync).ToList();
var results = await Task.WhenAll(tasks);
Task first = await Task.WhenAny(t1, Task.Delay(1000));
~~~

## Семантика {#semantics}

- Запуск задач и ожидание разделены: сначала вызовите методы (они стартуют), затем `await Task.WhenAll(...)`. Запись `await a(); await b();` выполняет **последовательно**.
- `WhenAll` возвращает массив результатов в **порядке исходных задач**; если одна из задач завершилась с ошибкой, результат `await` содержит первое исключение, остальные доступны через `.Exception.InnerExceptions` у возвращённой задачи ([исключения](#/ref/f/as-exceptions)).
- `WhenAny` возвращает **задачу-победителя**; остальные продолжают работать. Таймаут: `WhenAny(task, Task.Delay(…))`; удобнее `task.WaitAsync(TimeSpan, ct)`.
- Ограничивайте степень параллелизма: тысячи одновременных запросов перегрузят сервис. Используйте `SemaphoreSlim`, `Parallel.ForEachAsync` с `MaxDegreeOfParallelism` или `Channel`.
- `await foreach (var t in Task.WhenEach(tasks))` (.NET 9) выдаёт задачи по мере завершения.
- Перед `WhenAll` материализуйте последовательность задач (`ToList()`), иначе ленивый `Select` запустит их при каждом переборе.
- Результаты безопасно собирать из `WhenAll`, а не из общей коллекции, в которую пишут задачи (гонки).
- Для независимых CPU-задач `Task.Run` внутри `WhenAll` использует пул потоков; число потоков ограничено.
- Не смешивайте: `await Task.WhenAll(list.Select(async x => await Foo(x)))` — это нормально и идиоматично.
- Когда нужны результаты по мере готовности, а не все сразу, используйте `Task.WhenEach` (.NET 9) или `Channel<T>`; для «первый успешный из нескольких источников» (запасные серверы) повторяйте `WhenAny`, исключая завершившиеся с ошибкой задачи из списка.
- Не забывайте отменять оставшиеся операции после победителя `WhenAny`: передавайте всем общий `CancellationToken` и вызывайте `Cancel()`, иначе «проигравшие» продолжат работать и расходовать ресурсы.

## Под капотом {#internals}

`WhenAll` регистрирует продолжения на каждой задаче и уменьшает счётчик; последняя завершившаяся завершает общую задачу. `WhenAny` завершается первым сработавшим продолжением.

## Сложность {#complexity}

`O(n)` на создание продолжений; общее время ≈ время самой долгой операции плюс накладные расходы.

## Версии {#versions}

- .NET 4.5 — `WhenAll`, `WhenAny`; .NET 6 — `WaitAsync`.
- .NET 6 — `Parallel.ForEachAsync`; .NET 9 — `Task.WhenEach`.

## Ловушки {#pitfalls}

**Последовательное ожидание вместо параллельного.**

~~~csharp
var sw = System.Diagnostics.Stopwatch.StartNew();
await Slow(1); await Slow(2); await Slow(3);                // ❌ около 3×
long seq = sw.ElapsedMilliseconds;

sw.Restart();
var rs = await Task.WhenAll(Slow(1), Slow(2), Slow(3));      // ✅ около 1×
long par = sw.ElapsedMilliseconds;

Console.WriteLine(string.Join(",", rs));
Console.WriteLine(par < seq);

static async Task<int> Slow(int n) { await Task.Delay(100); return n * 10; }
~~~
~~~console
10,20,30
True
~~~

**Ленивый `Select` без `ToList`** запускает задачи при каждом переборе.

**Потеря исключений:** `await WhenAll` показывает только первое.

**Неограниченный параллелизм** — шквал запросов к сервису или базе.

## Примеры {#examples}

~~~csharp
var winner = await Task.WhenAny(Work("A", 80), Work("B", 20), Work("C", 50));
Console.WriteLine(await winner);

try { await Task.Delay(500).WaitAsync(TimeSpan.FromMilliseconds(30)); }
catch (TimeoutException) { Console.WriteLine("таймаут"); }

static async Task<string> Work(string n, int ms) { await Task.Delay(ms); return n; }
~~~
~~~console
B
таймаут
~~~

@@ref id="as-exceptions" cat="F" title="Исключения в асинхронном коде" cs="5.0" cx="O(1)" mem="O(1)" danger="1" tags="async void AggregateException Task.Exception unobserved fire and forget исключения в Task await WhenAll обработка ошибок TaskScheduler.UnobservedTaskException" topic="p5-async-pitfalls,p1-exceptions" related="as-task,as-whenall,fl-try-catch,fl-rethrow" learn="dotnet/standard/asynchronous-programming-patterns/exception-handling-task-parallel-library::Обработка исключений в TPL"
Исключение в `async`-методе не выбрасывается сразу: оно сохраняется в возвращённой задаче и появляется при `await`. Поэтому «забытая» задача проглатывает ошибки.

## Синтаксис {#syntax}

~~~csharp @nocheck
try { await DoAsync(); }
catch (InvalidOperationException e) { ... }          // await разворачивает исключение
var t = Task.WhenAll(a, b);
try { await t; } catch { foreach (var ex in t.Exception!.InnerExceptions) Log(ex); }
async void Handler() { }                              // исключение уйдёт в контекст
~~~

## Семантика {#semantics}

- `await` выбрасывает **первое внутреннее** исключение, а не `AggregateException`. Синхронные `Wait()`/`Result` оборачивают в `AggregateException`.
- Исключение, возникшее в `async Task`-методе, превращает задачу в `Faulted`. Если вызывающий не ожидает задачу и не читает `Exception`, ошибка «теряется» (необработанное; событие `UnobservedTaskException` лишь сообщает о ней при сборке мусора).
- `async void` — исключение бросается в `SynchronizationContext` и обычно завершает процесс; поймать его в вызывающем коде нельзя. Допустим только для обработчиков событий.
- «Выстрелил и забыл» (fire-and-forget) делайте явно: ловите и логируйте внутри самой задачи, например `_ = RunSafeAsync();` с `try/catch` внутри.
- Проверки аргументов в `async`-методе бросаются как исключение **задачи**, а не синхронно (в отличие от обычных методов). Если нужна немедленная проверка, вынесите её во внешний неасинхронный метод.
- `Task.WhenAll` агрегирует исключения всех задач в `Task.Exception.InnerExceptions`; `await` покажет только первое.
- `OperationCanceledException` — особый случай ([отмена](#/ref/f/as-cancellation)): задача переходит в `Canceled`, а не `Faulted`.
- Блок `finally` в `async`-методе выполняется после завершения ожидания; `catch` может содержать `await` (C# 6+).
- Не оборачивайте `await` в `Task.Run(() => ...).Wait()`, чтобы «поймать» ошибку: используйте обычный `try/catch` вокруг `await`.

## Под капотом {#internals}

Билдер метода ловит исключение из `MoveNext`, вызывает `SetException` у `Task`. При `await` продолжение читает исключение и перебрасывает его через `ExceptionDispatchInfo` — стек сохраняется.

## Сложность {#complexity}

Как у обычных исключений: дорогой захват и раскрутка стека; на пути без ошибок дополнительных затрат нет.

## Версии {#versions}

- C# 5 — `async/await`; C# 6 — `await` в `catch`/`finally`.
- .NET 4.5 — по умолчанию необработанные исключения задач не завершают процесс (в отличие от 4.0).

## Ловушки {#pitfalls}

**Исключение «теряется» без `await`; `await` показывает только первое.**

~~~csharp
Task bad = Fail("потерянная");                // ❌ не ожидаем
Console.WriteLine("продолжили без ошибки");
try { await bad; } catch (Exception e) { Console.WriteLine("поймали позже: " + e.Message); }

var a = Fail("первая"); var b = Fail("вторая");
var all = Task.WhenAll(a, b);
try { await all; }
catch (Exception) { Console.WriteLine("await показал одну, всего: " + all.Exception!.InnerExceptions.Count); }

try { Task.Delay(1).ContinueWith(_ => throw new Exception("x")).Wait(); }
catch (AggregateException e) { Console.WriteLine("Wait даёт " + e.GetType().Name); }

static async Task Fail(string m) { await Task.Delay(5); throw new InvalidOperationException(m); }
~~~
~~~console
продолжили без ошибки
поймали позже: потерянная
await показал одну, всего: 2
Wait даёт AggregateException
~~~

**`async void`** — необработанное исключение может уронить процесс.

**Блокирующее `.Wait()`** даёт `AggregateException` и риск взаимной блокировки.

**Fire-and-forget без `try/catch`** внутри — ошибки видны только в логах сборщика мусора.

## Примеры {#examples}

~~~csharp
async Task<int> SafeParse(string s)
{
    try { await Task.Yield(); return int.Parse(s); }
    catch (FormatException) { return -1; }
    finally { Console.WriteLine("разобрали " + s); }
}
Console.WriteLine(await SafeParse("12"));
Console.WriteLine(await SafeParse("x"));

_ = RunSafeAsync();                                   // fire-and-forget с защитой
await Task.Delay(50);

static async Task RunSafeAsync()
{
    try { await Task.Delay(1); throw new Exception("фоновая ошибка"); }
    catch (Exception e) { Console.WriteLine("залогировано: " + e.Message); }
}
~~~
~~~console
разобрали 12
12
разобрали x
-1
залогировано: фоновая ошибка
~~~

@@ref id="as-deadlock" cat="F" title="Блокировка: .Result, .Wait() и sync over async" cs="5.0" cx="O(1)" mem="O(1)" danger="1" tags="deadlock взаимная блокировка Result Wait GetAwaiter().GetResult() sync over async async over sync SynchronizationContext голодание пула потоков" topic="p5-async-pitfalls" related="as-async-await,as-task,fl-lock" learn="dotnet/csharp/asynchronous-programming/async-scenarios::Сценарии асинхронного программирования"
Синхронное ожидание асинхронной операции (`.Result`, `.Wait()`) блокирует поток. В окружениях с однопоточным контекстом (UI, старый ASP.NET) это приводит к взаимной блокировке, а на сервере — к исчерпанию пула потоков.

## Синтаксис {#syntax}

~~~csharp @nocheck
var data = GetAsync().Result;                 // ❌ блокирует
GetAsync().Wait();                            // ❌
var d = GetAsync().GetAwaiter().GetResult();  // ❌ лучше, но всё ещё блокирует
var ok = await GetAsync();                    // ✅
~~~

## Семантика {#semantics}

- **Классический deadlock:** UI-поток вызывает `Foo().Result`. `Foo` внутри делает `await` и хочет вернуться в UI-контекст, но UI-поток занят ожиданием `Result`. Каждый ждёт другого.
- В ASP.NET Core нет контекста синхронизации, поэтому классического deadlock нет, но блокирующее ожидание всё равно занимает поток пула; при большом числе запросов возникает **голодание** (thread pool starvation) и сервис «замирает».
- `GetAwaiter().GetResult()` бросает исходное исключение (не `AggregateException`), но блокирует точно так же.
- Правило «async all the way»: если метод вызывает асинхронный код, он сам становится асинхронным, и так до точки входа (`Main`, обработчик, контроллер).
- В консольном `Main` используйте `static async Task Main`; в конструкторах и `Dispose` асинхронный код недопустим — используйте фабричные методы `CreateAsync` и `IAsyncDisposable`.
- Если блокировка неизбежна (унаследованный API), запускайте асинхронный код в `Task.Run(...)` и блокируйтесь на нём — это убирает захваченный контекст, но не лечит голодание.
- `ConfigureAwait(false)` в библиотечном коде снижает риск deadlock для вызывающего, который блокируется.
- **Async over sync** (обернуть синхронный вызов в `Task.Run` и выдать как асинхронный) на сервере бессмысленно: поток всё равно занят; делайте API честно синхронным или используйте настоящий асинхронный ввод-вывод.
- Тестовые рамки и `Main` ранних версий C# ради удобства блокируют; современные поддерживают `async` напрямую.

## Под капотом {#internals}

Продолжение после `await` ставится в очередь контекста синхронизации (в UI — очередь сообщений потока). Если этот поток заблокирован, очередь не обрабатывается, и задача, которую он ждёт, не завершается.

## Сложность {#complexity}

Блокирующее ожидание стоит потока (≈1 МБ стека) на время операции; при `N` одновременных запросах пул истощается и пропускная способность падает.

## Версии {#versions}

- C# 5 — `async/await`; C# 7.1 — `async Task Main`.
- .NET Core — нет контекста синхронизации по умолчанию; ASP.NET Core — нет классического deadlock.

## Ловушки {#pitfalls}

**Голодание пула потоков при блокирующем ожидании.**

~~~csharp
ThreadPool.SetMinThreads(2, 2);
var sw = System.Diagnostics.Stopwatch.StartNew();
var blocked = Enumerable.Range(0, 8).Select(_ => Task.Run(() => Wait100().GetAwaiter().GetResult())).ToArray();
await Task.WhenAll(blocked);
long bad = sw.ElapsedMilliseconds;                      // потоки заняты ожиданием

sw.Restart();
await Task.WhenAll(Enumerable.Range(0, 8).Select(_ => Wait100()));
long good = sw.ElapsedMilliseconds;                     // ничего не блокируем

Console.WriteLine(bad > good);
static async Task Wait100() => await Task.Delay(100);
~~~
~~~console
True
~~~

**Deadlock `Result` в UI** — замораживание окна.

**`async void` в библиотечных методах** — нельзя ни ожидать, ни перехватить ошибки.

**Конструктор с блокирующим ожиданием** при внедрении зависимостей.

## Примеры {#examples}

~~~csharp
// Правильно: вся цепочка асинхронна
var repo = await Repo.CreateAsync();
Console.WriteLine(await repo.GetAsync(3));

class Repo
{
    private Repo() { }
    public static async Task<Repo> CreateAsync() { await Task.Delay(5); return new Repo(); }   // вместо async-конструктора
    public async Task<string> GetAsync(int id) { await Task.Delay(5); return "запись " + id; }
}
~~~
~~~console
запись 3
~~~
