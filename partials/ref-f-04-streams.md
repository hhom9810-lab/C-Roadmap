@@ref id="as-async-streams" cat="F" title="Асинхронные потоки: IAsyncEnumerable" cs="8.0" cx="O(1) на элемент" mem="O(1)" tags="IAsyncEnumerable await foreach async yield EnumeratorCancellation ConfigureAwait ReadAllAsync потоковая отдача стриминг" topic="p5-async,p2-iterators" related="fl-iterators,fl-foreach,as-cancellation,co-concurrent" learn="dotnet/csharp/asynchronous-programming/generate-consume-asynchronous-stream::Создание и использование асинхронных потоков"
`IAsyncEnumerable<T>` — последовательность, элементы которой получаются асинхронно: вы вызываете `await foreach`, а источник между элементами может ждать данных (сеть, база, канал).

## Синтаксис {#syntax}

~~~csharp @nocheck
async IAsyncEnumerable<int> GenerateAsync([EnumeratorCancellation] CancellationToken ct = default)
{
    for (int i = 0; i < 5; i++) { await Task.Delay(100, ct); yield return i; }
}
await foreach (var x in GenerateAsync(ct)) { ... }
await foreach (var y in source.WithCancellation(ct).ConfigureAwait(false)) { ... }
~~~

## Семантика {#semantics}

- Метод с `async` и `yield return`, возвращающий `IAsyncEnumerable<T>`, — **асинхронный итератор**: сочетает ленивость итераторов ([yield](#/ref/d/fl-iterators)) и неблокирующее ожидание.
- Потребляется только `await foreach`; результат нельзя перебрать обычным `foreach`.
- Отмена: токен передают параметром, помеченным `[EnumeratorCancellation]`, либо через `WithCancellation(ct)` на потребителе; обе формы объединяются.
- Каждый перебор запускает итератор заново, как у `IEnumerable<T>`; если нужен единый поток для нескольких потребителей — `Channel<T>`.
- Преимущество перед `Task<List<T>>`: первые элементы доступны сразу, память не растёт с размером набора, поток можно прервать на середине.
- Типичные источники: EF Core `AsAsyncEnumerable()`, чтение файла построчно, подписки на события, `Channel<T>.Reader.ReadAllAsync()`, `HttpClient.GetFromJsonAsAsyncEnumerable`.
- ASP.NET Core Minimal API/контроллер может вернуть `IAsyncEnumerable<T>` — ответ отправляется клиенту по мере получения (JSON-массив стримится).
- Исключения в итераторе приходят в `await foreach`; `DisposeAsync` вызывается автоматически (`await using` под капотом).
- LINQ над асинхронными потоками: пакет `System.Linq.Async` (в .NET 10 операторы входят в BCL — требует проверки версии пакета).
- Для разработчика API это значит: вместо возврата тяжёлого `List<T>` метод может отдавать записи по мере чтения из базы или файла. Клиенту это сокращает время до первого результата, серверу — расход памяти. Но тестируйте потребителей: ошибка посреди потока обрывает уже начатый ответ.
- Для преобразований над асинхронными потоками (`Where`, `Select`, `Take`) используйте библиотечные операторы либо пишите собственные асинхронные итераторы, принимающие `IAsyncEnumerable<T>` и возвращающие его.

## Под капотом {#internals}

Компилятор строит конечный автомат с реализацией `IAsyncEnumerator<T>` (`MoveNextAsync` возвращает `ValueTask<bool>`, `Current`, `DisposeAsync`). Отсутствие аллокаций при синхронном завершении обеспечивает `ValueTask`.

## Сложность {#complexity}

Каждый элемент — вызов `MoveNextAsync` (чаще завершается синхронно). Память `O(1)` для источника, который не буферизует.

## Версии {#versions}

- C# 8 / .NET Core 3.0 — `IAsyncEnumerable<T>`, `await foreach`, `await using`.
- .NET Core 3.0 — `ReadAllAsync` у каналов; .NET 6 — `Parallel.ForEachAsync` принимает `IAsyncEnumerable<T>`.

## Ловушки {#pitfalls}

**Токен и повторный перебор.**

~~~csharp
using var cts = new CancellationTokenSource();
var seen = new List<int>();
try
{
    await foreach (var x in Src.Numbers().WithCancellation(cts.Token))
    {
        seen.Add(x);
        if (x == 3) cts.Cancel();
    }
}
catch (OperationCanceledException) { Console.WriteLine("отменено после " + string.Join(",", seen)); }

await foreach (var x in Src.Numbers()) { }          // второй перебор — заново
Console.WriteLine(Src.Starts);

static class Src
{
    public static int Starts;
    public static async IAsyncEnumerable<int> Numbers([System.Runtime.CompilerServices.EnumeratorCancellation] CancellationToken ct = default)
    {
        Starts++;
        for (int i = 1; i <= 5; i++) { await Task.Delay(5, ct); yield return i; }
    }
}
~~~
~~~console
отменено после 1,2,3
2
~~~

**Буферизация** всего потока в список убирает смысл потоковости.

**Забытый `[EnumeratorCancellation]`:** токен из `WithCancellation` не доходит до метода.

**Блокирующее чтение** внутри итератора (синхронный ввод-вывод).

## Примеры {#examples}

~~~csharp
await foreach (var line in Lines()) Console.WriteLine(line);

var total = 0;
await foreach (var n in Squares(4)) total += n;
Console.WriteLine(total);

static async IAsyncEnumerable<string> Lines()
{
    foreach (var s in new[] { "первая", "вторая" }) { await Task.Delay(1); yield return s; }
}
static async IAsyncEnumerable<int> Squares(int n)
{
    for (int i = 1; i <= n; i++) { await Task.Yield(); yield return i * i; }
}
~~~
~~~console
первая
вторая
30
~~~

@@ref id="as-timers" cat="F" title="Задержки и таймеры: Task.Delay, PeriodicTimer" cs="5.0" cx="O(1)" mem="O(1)" tags="Task.Delay PeriodicTimer System.Threading.Timer TimeProvider таймер периодическая задача дрейф Stopwatch интервал polling" topic="p5-background,p5-async" related="as-cancellation,as-background,as-task" learn="dotnet/api/system.threading.periodictimer::PeriodicTimer"
Для ожидания и периодических действий используйте `Task.Delay` и `PeriodicTimer`: они не блокируют поток, учитывают отмену, а `PeriodicTimer` не накапливает задержку между срабатываниями.

## Синтаксис {#syntax}

~~~csharp @nocheck
await Task.Delay(TimeSpan.FromSeconds(1), ct);
using var timer = new PeriodicTimer(TimeSpan.FromSeconds(5));
while (await timer.WaitForNextTickAsync(ct)) { await DoWorkAsync(); }
var t = new System.Threading.Timer(_ => Tick(), null, dueTime: 0, period: 1000);
var sw = Stopwatch.StartNew();   TimeSpan el = sw.Elapsed;
~~~

## Семантика {#semantics}

- `Task.Delay(ms)` создаёт задачу, завершающуюся по истечении времени; точность ограничена таймером ОС (≈ 1–15 мс, возможны отклонения).
- `Thread.Sleep` блокирует поток — в асинхронном коде заменяйте на `await Task.Delay`.
- **`PeriodicTimer` (.NET 6)**: цикл `while (await WaitForNextTickAsync())` — один тик за раз; если обработка длиннее интервала, лишние тики пропускаются (не накапливаются). Рекомендуемый способ фоновых периодических задач.
- `System.Threading.Timer` вызывает метод в пуле потоков; обратные вызовы **могут перекрываться**, если обработка длиннее периода, и исключение в них завершает процесс — защищайтесь `try/catch`.
- `System.Timers.Timer` и `DispatcherTimer` (UI) — для старого кода и интерфейсов.
- Для замеров времени используйте `Stopwatch` (монотонный), а не `DateTime.Now`: системное время может скачкообразно меняться.
- `TimeProvider` (.NET 8) абстрагирует время и таймеры, что позволяет тестировать код с задержками без реального ожидания (`FakeTimeProvider`).
- Для повторных попыток с нарастающей паузой (backoff) используйте библиотеку Polly или `Task.Delay` в цикле с токеном отмены.
- Таймеры нужно освобождать (`Dispose`), иначе они удерживают объекты и продолжают срабатывать.
- В тестах не ждите реальное время: принимайте `TimeProvider` в конструкторе (по умолчанию `TimeProvider.System`) и подменяйте его на `FakeTimeProvider`, который позволяет «перемотать» время, не засыпая. Так тесты с таймаутами и повторами выполняются мгновенно и детерминированно.

## Под капотом {#internals}

Таймеры .NET используют единую очередь таймеров среды выполнения, которую обслуживает выделенный поток; при срабатывании продолжения ставятся в пул потоков. `Task.Delay` создаёт `TimerQueueTimer` и завершает задачу из обратного вызова.

## Сложность {#complexity}

Задержка стоит аллокации задачи и записи в очереди таймеров; тысячи одновременных `Delay` допустимы и дёшевы.

## Версии {#versions}

- .NET 4.5 — `Task.Delay`; .NET 6 — `PeriodicTimer`; .NET 8 — `TimeProvider`.

## Ловушки {#pitfalls}

**Перекрытие обратных вызовов и дрейф.**

~~~csharp
int running = 0, maxRunning = 0;
var gate = new object();
using var timer = new Timer(_ =>
{
    int r = Interlocked.Increment(ref running);
    lock (gate) maxRunning = Math.Max(maxRunning, r);
    Thread.Sleep(60);                                        // обработка длиннее периода 20 мс
    Interlocked.Decrement(ref running);
}, null, 0, 20);
await Task.Delay(250);
Console.WriteLine(maxRunning > 1);                           // ❌ вызовы перекрываются

int ticks = 0;
using var pt = new PeriodicTimer(TimeSpan.FromMilliseconds(20));
using var cts = new CancellationTokenSource(250);
try { while (await pt.WaitForNextTickAsync(cts.Token)) { ticks++; await Task.Delay(60); } }   // ✅ без перекрытия
catch (OperationCanceledException) { }
Console.WriteLine(ticks is >= 2 and <= 5);

~~~
~~~console
True
True
~~~

**`Thread.Sleep` в `async`-методе** блокирует поток пула.

**`DateTime.Now` для измерения интервалов** искажается переводом часов.

**Таймер без `Dispose`** продолжает работать и держит ссылки.

## Примеры {#examples}

~~~csharp
var sw = System.Diagnostics.Stopwatch.StartNew();
await Task.Delay(100);
Console.WriteLine(sw.ElapsedMilliseconds >= 90);

int n = 0;
using var timer = new PeriodicTimer(TimeSpan.FromMilliseconds(10));
while (await timer.WaitForNextTickAsync() && ++n < 3) { }
Console.WriteLine(n);
~~~
~~~console
True
3
~~~

@@ref id="as-background" cat="F" title="Фоновые службы: BackgroundService и IHostedService" cs="8.0" cx="O(1)" mem="O(1)" tags="BackgroundService IHostedService ExecuteAsync StartAsync StopAsync AddHostedService Generic Host фоновая задача worker service очередь заданий scoped в фоновой службе" topic="p5-background,p4-hosting" related="as-timers,as-cancellation,co-concurrent,as-exceptions" learn="dotnet/core/extensions/workers::Рабочие службы (Worker Services)"
Фоновая служба — долгоживущий компонент, который запускается вместе с приложением и работает независимо от HTTP-запросов: очереди, периодические задачи, подписки.

## Синтаксис {#syntax}

~~~csharp @nocheck
public class Worker(ILogger<Worker> log) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            await DoWorkAsync(stoppingToken);
            await Task.Delay(TimeSpan.FromSeconds(10), stoppingToken);
        }
    }
}
builder.Services.AddHostedService<Worker>();
~~~

## Семантика {#semantics}

- `IHostedService` имеет методы `StartAsync` и `StopAsync`; `BackgroundService` — готовый базовый класс с единственным методом `ExecuteAsync(CancellationToken)`, который запускается при старте хоста.
- Метод `ExecuteAsync` должен **вернуть управление при первом `await`**: хост запускает службы по очереди, и синхронная долгая работа в начале блокирует запуск приложения.
- Токен `stoppingToken` срабатывает при остановке приложения; цикл обязан завершиться вовремя (по умолчанию тайм-аут остановки — 30 секунд в .NET 6+, настраивается).
- **Необработанное исключение** в `ExecuteAsync` с .NET 6 по умолчанию останавливает хост (`BackgroundServiceExceptionBehavior.StopHost`) — ловите и логируйте исключения внутри цикла, чтобы одна ошибка не роняла службу.
- Фоновая служба регистрируется как **singleton**. Зависимости со временем жизни scoped (например, `DbContext`) получайте через `IServiceScopeFactory.CreateScope()` на каждую итерацию.
- Для очереди заданий из контроллеров используйте `Channel<T>` как буфер между запросом и службой; хранение заданий только в памяти теряется при перезапуске — для надёжности нужна внешняя очередь или база.
- Периодические задачи: `PeriodicTimer` ([таймеры](#/ref/f/as-timers)) или Quartz/Hangfire для расписаний и повторов.
- Несколько экземпляров приложения запустят службу несколько раз; для единственного исполнителя нужна блокировка (распределённая) или отдельный сервис.
- Проверяйте корректное завершение: тест, в котором служба запускается и отменяется, и проверка, что в течение таймаута она остановилась.

## Под капотом {#internals}

Хост (`Generic Host`) при старте вызывает `StartAsync` у каждой зарегистрированной службы; `BackgroundService.StartAsync` запускает `ExecuteAsync` и возвращает его задачу, если она не завершилась синхронно. При остановке хост отменяет токен и ждёт задачи с тайм-аутом.

## Сложность {#complexity}

Сама служба стоит одной задачи на всё время жизни; нагрузку определяет её работа.

## Версии {#versions}

- .NET Core 2.0 — `IHostedService`; .NET Core 3.0 — `BackgroundService`.
- .NET 6 — необработанные исключения останавливают хост по умолчанию; .NET 8 — `IHostedLifecycleService` (хуки жизненного цикла).

## Ловушки {#pitfalls}

**Исключение в итерации останавливает службу.** Пример воспроизводит логику `BackgroundService` без пакета Hosting: базовый класс запускает `ExecuteAsync` и ждёт его при остановке.

~~~csharp
var svc = new Worker();
await svc.StartAsync();
await Task.Delay(150);
await svc.StopAsync();
Console.WriteLine($"итераций >= 2: {Worker.Iterations >= 2}, ошибок: {Worker.Errors}, остановлена: {Worker.Stopped}");

abstract class MiniBackgroundService
{
    private readonly CancellationTokenSource _cts = new();
    private Task? _run;
    protected abstract Task ExecuteAsync(CancellationToken ct);
    public Task StartAsync() { _run = ExecuteAsync(_cts.Token); return Task.CompletedTask; }
    public async Task StopAsync() { _cts.Cancel(); if (_run is not null) await _run; }
}
class Worker : MiniBackgroundService
{
    public static int Iterations, Errors; public static bool Stopped;
    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        while (!ct.IsCancellationRequested)
        {
            try { Iterations++; if (Iterations == 1) throw new InvalidOperationException("сбой итерации"); await Task.Delay(30, ct); }
            catch (OperationCanceledException) { break; }
            catch (Exception) { Errors++; }                    // ✅ ловим внутри цикла
        }
        Stopped = true;
    }
}
~~~
~~~console
итераций >= 2: True, ошибок: 1, остановлена: True
~~~

**Scoped-зависимость в конструкторе singleton-службы** — ошибка внедрения.

**Игнорирование `stoppingToken`:** приложение останавливается по тайм-ауту.

**Длинная синхронная работа в начале `ExecuteAsync`** задерживает запуск хоста.

## Примеры {#examples}

Регистрация и работа с внедрением зависимостей показаны фрагментом (пакет `Microsoft.Extensions.Hosting` не входит в базовую библиотеку, поэтому фрагмент не компилируется автономно — требует проверки в проекте с этим пакетом):

~~~csharp @nocheck
public class Worker(IServiceScopeFactory scopes, ILogger<Worker> log) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromMinutes(1));
        while (await timer.WaitForNextTickAsync(ct))
        {
            await using var scope = scopes.CreateAsyncScope();          // scoped-зависимости на каждый тик
            var db = scope.ServiceProvider.GetRequiredService<AppDb>();
            try { await Cleanup(db, ct); }
            catch (Exception e) when (e is not OperationCanceledException) { log.LogError(e, "сбой очистки"); }
        }
    }
}
builder.Services.AddHostedService<Worker>();
~~~
