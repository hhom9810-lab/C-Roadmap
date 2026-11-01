@@ref id="as-threads" cat="F" title="Потоки и пул потоков" cs="1.0" cx="O(1)" mem="O(стек)" tags="Thread ThreadPool Task.Run LongRunning ManagedThreadId IsBackground поток пул потоков ThreadLocal AsyncLocal переключение контекста голодание" topic="p5-concurrency" related="as-task,as-deadlock,as-parallel,fl-lock" learn="dotnet/standard/threading/threads-and-threading::Потоки и многопоточность"
Поток — единица исполнения процессора; создание дорого, поэтому почти всегда работу ставят в очередь пула потоков (`Task.Run`, `ThreadPool`), а собственные `Thread` создают только для долгих специальных задач.

## Синтаксис {#syntax}

~~~csharp @nocheck
var t = new Thread(() => Work()) { IsBackground = true, Name = "worker" };
t.Start();  t.Join();
ThreadPool.QueueUserWorkItem(_ => Work());
Task.Run(() => Work());
Task.Factory.StartNew(Work, TaskCreationOptions.LongRunning);
[ThreadStatic] static int _x;   var l = new ThreadLocal<int>();   var a = new AsyncLocal<string>();
~~~

## Семантика {#semantics}

- Переднеплановый поток (по умолчанию) удерживает процесс живым; фоновый (`IsBackground = true`) завершается вместе с процессом.
- **Пул потоков** держит набор рабочих потоков и очередь работ; число потоков растёт и уменьшается автоматически (hill-climbing), но медленно: добавляется поток примерно раз в 0,5–1 с при нехватке.
- `Task.Run` — стандартный способ выполнить CPU-работу в пуле; `TaskCreationOptions.LongRunning` выделяет отдельный поток для долгих задач, чтобы не истощать пул.
- Не блокируйте потоки пула долгими операциями (`Thread.Sleep`, `.Result`): остальные задачи ждут свободного потока (голодание).
- Данные, общие между потоками, требуют синхронизации ([lock](#/ref/d/fl-lock), [примитивы](#/ref/f/as-sync-primitives)); данные потока — `ThreadLocal<T>`/`[ThreadStatic]`; данные, «текущие» вместе с асинхронным потоком выполнения, — `AsyncLocal<T>`.
- Исключение в потоке без обработчика завершает процесс; в задачах оно сохраняется в `Task`.
- Приоритеты и привязка потоков к ядрам почти не нужны; доверьтесь планировщику ОС.
- Число потоков не равно числу параллельных операций: ввод-вывод асинхронен и не занимает потоки.
- Для UI-приложений доступ к элементам интерфейса разрешён только из UI-потока (`Dispatcher`, `Control.Invoke`).
- `Thread.Abort` не поддерживается в .NET Core / .NET 5+.

## Под капотом {#internals}

Поток ОС с отдельным стеком (по умолчанию 1 МБ на Windows/Linux) и состоянием. Пул использует глобальную и локальные очереди с кражей работ (work stealing). Переключение контекста стоит микросекунды и сбрасывает кэши.

## Сложность {#complexity}

Создание потока — десятки–сотни микросекунд и ≈1 МБ резерва стека; постановка в пул — сотни наносекунд. Слишком много потоков ухудшают производительность из-за переключений.

## Версии {#versions}

- .NET 1.0 — `Thread`, `ThreadPool`; .NET 4.0 — `Task`, `ThreadLocal<T>`; .NET 4.6 — `AsyncLocal<T>`.
- .NET 6 — переработанный пул потоков на управляемом коде.

## Ловушки {#pitfalls}

**Изменение общих данных из нескольких потоков.**

~~~csharp
int total = 0;
var threads = Enumerable.Range(0, 4).Select(_ => new Thread(() => { for (int i = 0; i < 100000; i++) Interlocked.Increment(ref total); })).ToList();
threads.ForEach(t => t.Start());
threads.ForEach(t => t.Join());
Console.WriteLine(total);

var local = new ThreadLocal<int>(() => Environment.CurrentManagedThreadId);
int main = local.Value;
int other = await Task.Run(() => local.Value);
Console.WriteLine(main != other);
~~~
~~~console
400000
True
~~~

**Блокирование потоков пула** вызывает голодание.

**Создание потока на каждый запрос** — расход ресурсов; используйте пул.

**Обращение к UI из фонового потока** — исключение.

## Примеры {#examples}

~~~csharp
var t = new Thread(() => Console.WriteLine("в потоке: " + Thread.CurrentThread.Name)) { Name = "worker" };
t.Start();
t.Join();

int onPool = await Task.Run(() => Thread.CurrentThread.IsThreadPoolThread ? 1 : 0);
Console.WriteLine(onPool);
Console.WriteLine(Thread.CurrentThread.IsBackground);
~~~
~~~console
в потоке: worker
1
False
~~~

@@ref id="as-parallel" cat="F" title="Parallel и PLINQ" cs="4.0" cx="O(n/p)" mem="O(p)" tags="Parallel.For Parallel.ForEach Parallel.ForEachAsync PLINQ AsParallel MaxDegreeOfParallelism параллельные циклы разбиение данных ParallelOptions" topic="p5-concurrency" related="as-threads,as-whenall,as-sync-primitives,co-linq-perf" learn="?dotnet/standard/parallel-programming/::Параллельное программирование"
`Parallel.For`/`ForEach` и PLINQ (`AsParallel`) распределяют итерации по потокам пула для ускорения CPU-нагрузки; `Parallel.ForEachAsync` делает то же для асинхронной работы с ограничением параллелизма.

## Синтаксис {#syntax}

~~~csharp @nocheck
Parallel.For(0, n, i => Work(i));
Parallel.ForEach(items, new ParallelOptions { MaxDegreeOfParallelism = 4 }, x => Process(x));
await Parallel.ForEachAsync(urls, new ParallelOptions { MaxDegreeOfParallelism = 8, CancellationToken = ct },
    async (url, token) => await http.GetAsync(url, token));
var r = data.AsParallel().Where(x => IsPrime(x)).ToArray();
~~~

## Семантика {#semantics}

- Распараллеливание выгодно, когда работа **на элемент существенная** (микросекунды и более), данных много, а итерации независимы. На коротких телах накладные расходы съедают выигрыш.
- `Parallel.For/ForEach` блокирует вызывающий поток до конца; порядок выполнения итераций **не определён**.
- Общие данные между итерациями требуют синхронизации; лучше накапливать локально в потоке (перегрузки с `localInit`/`localFinally`) и объединять в конце.
- `ParallelOptions.MaxDegreeOfParallelism` ограничивает число одновременных итераций; по умолчанию — число ядер (с запасом пула).
- Исключения собираются в `AggregateException`; остальные итерации прекращаются на следующей границе проверки.
- `Parallel.ForEachAsync` (.NET 6) подходит для ввода-вывода с лимитом параллелизма и отмены; `Parallel.For` для ввода-вывода не используйте — потоки будут блокироваться.
- **PLINQ**: `AsParallel()` превращает запрос в параллельный; порядок результатов не сохраняется без `AsOrdered()`; `ForAll` обрабатывает без сбора.
- Для веб-серверов параллелизм внутри запроса конкурирует с другими запросами за пул потоков; осторожно.
- Измеряйте: ускорение редко линейно (закон Амдала), ограничено памятью и блокировками.
- Прежде чем распараллеливать, замерьте последовательную версию и найдите узкое место: часто выигрыш даёт алгоритм (словарь вместо списка, кэш), а не потоки. Параллельный код сложнее отлаживать и тестировать, а на сервере он забирает ядра у других запросов.
- Для обработки очереди заданий с ограничением нагрузки и обратным давлением лучше подходят `Channel<T>` с несколькими потребителями, чем `Parallel.ForEach` по заранее собранному списку.

## Под капотом {#internals}

Диапазон разбивается на фрагменты (partitions), которые берут рабочие задачи пула; фрагменты динамически перераспределяются. Для `Parallel.For` по диапазону используется динамическое разбиение с растущим размером порции.

## Сложность {#complexity}

Идеально `O(n/p)` на `p` ядрах; практическое ускорение меньше из-за накладных расходов, синхронизации и пропускной способности памяти.

## Версии {#versions}

- .NET 4.0 — `Parallel`, PLINQ; .NET 6 — `Parallel.ForEachAsync`.
- .NET 8/9 — улучшения планировщика и `Parallel.ForAsync`.

## Ловушки {#pitfalls}

**Общий счётчик без синхронизации и копеечная работа.**

~~~csharp
int unsafeSum = 0;
Parallel.For(0, 100000, i => unsafeSum += 1);                    // ❌ гонка

long safe = 0;
Parallel.For(0, 100000, () => 0L, (i, _, local) => local + 1, local => Interlocked.Add(ref safe, local));   // ✅ локальные суммы
Console.WriteLine(safe);
Console.WriteLine(unsafeSum <= 100000);

var ordered = Enumerable.Range(1, 10).AsParallel().AsOrdered().Select(x => x * x).ToArray();
Console.WriteLine(string.Join(",", ordered));
~~~
~~~console
100000
True
1,4,9,16,25,36,49,64,81,100
~~~

**Параллельный цикл для ввода-вывода** блокирует потоки.

**Порядок результатов PLINQ** случаен без `AsOrdered`.

**Параллелизм по маленьким телам** медленнее последовательного.

## Примеры {#examples}

~~~csharp
var opts = new ParallelOptions { MaxDegreeOfParallelism = 3 };
int current = 0, peak = 0;
await Parallel.ForEachAsync(Enumerable.Range(0, 9), opts, async (i, ct) =>
{
    int c = Interlocked.Increment(ref current);
    int p; do { p = peak; } while (c > p && Interlocked.CompareExchange(ref peak, c, p) != p);
    await Task.Delay(30, ct);
    Interlocked.Decrement(ref current);
});
Console.WriteLine(peak <= 3);

Console.WriteLine(Enumerable.Range(1, 1000).AsParallel().Sum());
~~~
~~~console
True
500500
~~~

@@ref id="as-sync-primitives" cat="F" title="Примитивы синхронизации: Interlocked, SemaphoreSlim, volatile" cs="1.0" cx="O(1)" mem="O(1)" danger="1" tags="Interlocked SemaphoreSlim ReaderWriterLockSlim volatile Mutex ManualResetEventSlim Barrier Lazy модель памяти видимость барьеры памяти CompareExchange" topic="p5-concurrency" related="fl-lock,as-whenall,co-concurrent,as-threads" learn="dotnet/standard/threading/overview-of-synchronization-primitives::Обзор примитивов синхронизации"
Примитивы синхронизации координируют потоки и задачи: `Interlocked` — атомарные операции, `SemaphoreSlim` — ограничение числа одновременных входов (в том числе асинхронное), `ReaderWriterLockSlim` — много читателей или один писатель.

## Синтаксис {#syntax}

~~~csharp @nocheck
Interlocked.Increment(ref n);   Interlocked.CompareExchange(ref x, newValue, expected);
var sem = new SemaphoreSlim(3);  await sem.WaitAsync(ct);  try { ... } finally { sem.Release(); }
var rw = new ReaderWriterLockSlim();  rw.EnterReadLock();  rw.ExitReadLock();
private volatile bool _stop;
var lazy = new Lazy<Config>(() => Load(), LazyThreadSafetyMode.ExecutionAndPublication);
~~~

## Семантика {#semantics}

- **`Interlocked`** выполняет чтение-изменение-запись атомарно (`Increment`, `Add`, `Exchange`, `CompareExchange`): подходит для счётчиков и «lock-free» алгоритмов.
- **`SemaphoreSlim(n)`** пропускает не более `n` потоков; `WaitAsync` не блокирует поток — единственный подходящий способ защитить участок с `await` (вместо `lock`). `SemaphoreSlim(1,1)` — асинхронный мьютекс.
- Всегда освобождайте семафор в `finally`; иначе утечка разрешений приведёт к вечному ожиданию.
- **`ReaderWriterLockSlim`** выгоден при преобладании чтения и долгих читающих секциях; при коротких секциях обычный `lock` часто быстрее.
- **`volatile`** гарантирует, что чтение/запись поля не будет переставлено компилятором или процессором так, чтобы нарушить видимость между потоками. Это не атомарность составных операций.
- Без синхронизации поток может **не увидеть** изменение флага другого потока (кэш регистров, перестановки): цикл `while (!_stop)` без `volatile` может не завершиться.
- **`Lazy<T>`** обеспечивает потокобезопасную ленивую инициализацию (по умолчанию `ExecutionAndPublication`); для статических данных удобен статический конструктор.
- `ManualResetEventSlim`, `AutoResetEvent`, `CountdownEvent`, `Barrier` — для координации этапов и ожидания сигнала; `Mutex` — межпроцессный.
- В новом коде для обмена данными предпочитайте `Channel<T>` и неизменяемые снимки вместо ручных примитивов.
- Выбор по сценарию: счётчик — `Interlocked`; короткая критическая секция — `lock`; ограничение числа операций и участок с `await` — `SemaphoreSlim`; много читателей — `ReaderWriterLockSlim` (после измерений); ленивая инициализация — `Lazy<T>`; сигнал между потоками — `ManualResetEventSlim`.

## Под капотом {#internals}

`Interlocked` компилируется в атомарные инструкции процессора (`lock xadd`, `cmpxchg`). `SemaphoreSlim` — счётчик с монитором и очередью асинхронных ожидателей. `volatile` вставляет барьеры памяти acquire/release.

## Сложность {#complexity}

`Interlocked` — десятки тактов; под высокой конкуренцией на одной ячейке — «пинг-понг» кэш-линии. `SemaphoreSlim` без конкуренции — наносекунды, с конкуренцией — переключение потоков.

## Версии {#versions}

- .NET 1.0 — `Interlocked`, `Mutex`; .NET 4.0 — `SemaphoreSlim`, `Lazy<T>`, `ManualResetEventSlim`.
- .NET 4.5 — `SemaphoreSlim.WaitAsync`; .NET 9 — `System.Threading.Lock`.

## Ловушки {#pitfalls}

**Ограничение параллелизма через семафор и забытый `Release`.**

~~~csharp
var sem = new SemaphoreSlim(2);
int current = 0, peak = 0;
async Task Work(int i)
{
    await sem.WaitAsync();
    try
    {
        int c = Interlocked.Increment(ref current);
        lock (sem) peak = Math.Max(peak, c);
        await Task.Delay(30);
        Interlocked.Decrement(ref current);
    }
    finally { sem.Release(); }                      // ✅ всегда освобождаем
}
await Task.WhenAll(Enumerable.Range(0, 8).Select(Work));
Console.WriteLine(peak);

long x = 0;
Interlocked.Exchange(ref x, 5);
Console.WriteLine(Interlocked.CompareExchange(ref x, 9, 5) + " " + x);
~~~
~~~console
2
5 9
~~~

**`lock` вокруг `await`** запрещён; используйте `SemaphoreSlim`.

**`volatile` вместо блокировки** для составных операций (`x++`).

**Забытый `Release`** на ветке с исключением или ранним `return`.

## Примеры {#examples}

~~~csharp
int initCount = 0;
var lazy = new Lazy<string>(() => { Interlocked.Increment(ref initCount); return "конфигурация"; });
Parallel.For(0, 50, i => { _ = lazy.Value; });
Console.WriteLine(lazy.Value + " " + initCount);

using var done = new ManualResetEventSlim(false);
_ = Task.Run(() => { Thread.Sleep(20); done.Set(); });
Console.WriteLine(done.Wait(2000));
~~~
~~~console
конфигурация 1
True
~~~
