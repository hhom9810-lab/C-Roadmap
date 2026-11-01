@@ref id="fl-iterators" cat="D" title="Итераторы и yield" cs="2.0" cx="O(1) на элемент" mem="O(1)" tags="yield return yield break итератор IEnumerable ленивое вычисление конечный автомат отложенное выполнение IAsyncEnumerable" topic="p2-iterators" related="fl-foreach,cl-local-closures,fl-guard" learn="dotnet/csharp/language-reference/statements/yield::yield"
Метод с `yield return` становится итератором: он не выполняется целиком, а выдаёт элементы по одному, приостанавливаясь после каждого `yield return` и возобновляясь при следующем запросе.

## Синтаксис {#syntax}

~~~csharp @nocheck
IEnumerable<int> Evens(int max)
{
    for (int i = 0; i <= max; i += 2) yield return i;
}
IEnumerable<T> Take<T>(IEnumerable<T> src, int n) { foreach (var x in src) { if (n-- <= 0) yield break; yield return x; } }
async IAsyncEnumerable<int> Stream() { yield return 1; await Task.Delay(1); yield return 2; }
~~~

## Семантика {#semantics}

- Возвращаемый тип — `IEnumerable<T>`, `IEnumerator<T>`, `IAsyncEnumerable<T>` или (необобщённые) соответствующие интерфейсы.
- Тело **не запускается при вызове метода**: выполнение начинается при первом `MoveNext()`. Исключения из тела тоже появляются только тогда ([проверка аргументов](#/ref/d/fl-guard)).
- Между `yield return` локальные переменные сохраняются, так что итератор можно приостановить и продолжить.
- `yield break` завершает последовательность. Выход из метода по `return` без значения — тоже конец, но `return value` в итераторе запрещён.
- Нельзя использовать `yield` в `try` с `catch`, в `finally` и в `unsafe`-блоках; `yield return` внутри `try` с `finally` разрешён: `finally` выполнится при освобождении перечислителя.
- Нельзя иметь параметры `ref`, `out`, `in` в итераторе (кроме `ref struct` в новых версиях); структура `Span<T>` в итераторе до C# 13 не разрешалась.
- Каждый повторный обход (`foreach`) запускает метод заново и пересчитывает последовательность.
- Бесконечные последовательности возможны (`while (true) yield return ...`), если потребитель берёт часть через `Take`.
- LINQ-операторы устроены как итераторы: `Where`, `Select`, `Take` и др. выполняются лениво.
- На практике итераторы удобны для потоковой обработки больших файлов и бесконечных генераторов. Если нужен повторный доступ к результату несколько раз, материализуйте его через `ToList()` или `ToArray()`, чтобы не повторять вычисления и побочные эффекты.

## Под капотом {#internals}

Компилятор строит класс — конечный автомат с полем `state` и копиями локальных переменных. `MoveNext()` выполняет код до следующего `yield return`, сохраняет состояние и возвращает `true`. Один и тот же объект служит и `IEnumerable`, и `IEnumerator` при первом обходе в том же потоке.

## Сложность {#complexity}

Память `O(1)` не считая замкнутых данных; на каждый вызов метода создаётся один объект автомата. Каждый элемент — вызов `MoveNext` и `Current`.

## Версии {#versions}

- C# 2.0 — `yield`; C# 8 — `async` итераторы (`IAsyncEnumerable<T>`).
- C# 13 — разрешено использовать `ref struct` в итераторах в ограниченном виде (требует проверки для конкретных сценариев).

## Ловушки {#pitfalls}

**Ленивость: код выполняется при переборе, а не при вызове.**

~~~csharp
var seq = Numbers();
Console.WriteLine("вызвали метод");
foreach (var x in seq) Console.WriteLine("получили " + x);
Console.WriteLine("второй проход:");
foreach (var x in seq) Console.Write(x + " ");
Console.WriteLine();

static IEnumerable<int> Numbers()
{
    Console.WriteLine("старт итератора");
    yield return 1;
    Console.WriteLine("между элементами");
    yield return 2;
}
~~~
~~~console
вызвали метод
старт итератора
получили 1
между элементами
получили 2
второй проход:
старт итератора
1 между элементами
2
~~~

**Повторный обход** повторяет побочные эффекты и работу.

**Захват изменяемого состояния:** итератор видит изменения внешних переменных между шагами.

**Исключения при проверке аргументов** откладываются; выносите проверку во внешний метод.

## Примеры {#examples}

~~~csharp
foreach (var f in Fib().Take(8)) Console.Write(f + " ");
Console.WriteLine();

foreach (var w in Words("one two  three")) Console.Write($"[{w}]");
Console.WriteLine();

static IEnumerable<long> Fib() { long a = 0, b = 1; while (true) { yield return a; (a, b) = (b, a + b); } }
static IEnumerable<string> Words(string s) { foreach (var p in s.Split(' ')) if (p.Length > 0) yield return p; }
~~~
~~~console
0 1 1 2 3 5 8 13 
[one][two][three]
~~~

@@ref id="fl-lock" cat="D" title="lock и взаимное исключение" cs="1.0" cx="O(1)" mem="O(1)" danger="1" tags="lock Monitor взаимное исключение критическая секция гонка данных System.Threading.Lock deadlock lock(this) object для блокировки" topic="p5-concurrency" related="fl-finally,cl-dispose,fl-jumps" learn="dotnet/csharp/language-reference/statements/lock::Оператор lock"
`lock` не даёт двум потокам одновременно выполнять защищённый участок: остальные ждут, пока владелец не выйдет из блока.

## Синтаксис {#syntax}

~~~csharp @nocheck
private readonly object _gate = new();
lock (_gate) { counter++; }
private readonly Lock _lock = new();       // .NET 9 / C# 13: System.Threading.Lock
lock (_lock) { ... }
Monitor.Enter(_gate, ref taken);  Monitor.Exit(_gate);    // что лежит под lock
~~~

## Семантика {#semantics}

- `lock (x) { … }` захватывает монитор объекта `x`, выполняет блок и освобождает монитор в `finally` — даже при исключении.
- Блокировка **реентерабельна**: поток, уже владеющий монитором, может войти повторно; счётчик входов учитывается.
- Блокируйтесь на **приватном** объекте, созданном специально для этого. Нельзя использовать `this`, `typeof(T)`, строки, значимые типы (`lock` по упакованному значению каждый раз по новому объекту): посторонний код может захватить тот же объект и вызвать взаимную блокировку.
- В `lock` нельзя использовать `await`: монитор привязан к потоку, а после ожидания код может продолжиться в другом. Для асинхронных участков — `SemaphoreSlim(1, 1)` с `WaitAsync()`.
- Держите блок как можно короче: никаких вызовов в чужой код, ввода-вывода, длительных вычислений.
- Для одиночных счётчиков достаточно `Interlocked.Increment`; для чтения чаще, чем записи — `ReaderWriterLockSlim`.
- Порядок захвата нескольких блокировок должен быть одинаковым во всех потоках, иначе — взаимная блокировка (deadlock).
- Потокобезопасные коллекции (`ConcurrentDictionary`, `ConcurrentQueue`) избавляют от ручных блокировок, но составные операции «проверил-и-записал» всё равно требуют атомарных методов (`GetOrAdd`, `AddOrUpdate`).
- В .NET 9 появился тип `System.Threading.Lock`: быстрее и яснее по смыслу, `lock` распознаёт его и использует `EnterScope`.
- Выбирайте инструмент по задаче: `lock` — взаимное исключение коротких секций; `Interlocked` — одиночные числа; `SemaphoreSlim` — ограничение числа одновременных операций и асинхронный код; `Concurrent*` — готовые структуры. Проверяйте участки с блокировками нагрузочными тестами: ошибки конкуренции проявляются редко.

## Под капотом {#internals}

Монитор хранится в заголовке объекта (облегчённая «тонкая» блокировка), при конкуренции превращается в «толстую» с ожиданием на событии ядра. Сначала поток вращается (spin), потом засыпает. `lock` компилируется в `Monitor.Enter` и `try/finally` с `Monitor.Exit`.

## Сложность {#complexity}

Без конкуренции — десятки наносекунд. При конкуренции стоимость растёт на микросекунды (переключение контекста). Пропускная способность падает, если секция длинная.

## Версии {#versions}

- C# 1.0 — `lock`; C# 4.0 — безопасная форма `Monitor.Enter(obj, ref taken)`.
- .NET 9 / C# 13 — `System.Threading.Lock`.

## Ловушки {#pitfalls}

**Гонка данных без `lock`.**

~~~csharp
int unsafeCount = 0, safeCount = 0, interlocked = 0;
var gate = new object();
Parallel.For(0, 100000, _ =>
{
    unsafeCount++;                          // ❌ неатомарно
    lock (gate) safeCount++;                // ✅
    Interlocked.Increment(ref interlocked); // ✅
});
Console.WriteLine(safeCount);
Console.WriteLine(interlocked);
Console.WriteLine(unsafeCount <= 100000);
~~~
~~~console
100000
100000
True
~~~

**`lock (this)` или `lock ("строка")`** — доступно извне, ведёт к взаимным блокировкам.

**`await` внутри `lock`** запрещён компилятором (CS1996).

**Вложенные блокировки в разном порядке** — классическая причина deadlock.

## Примеры {#examples}

~~~csharp
var counter = new Counter();
var tasks = Enumerable.Range(0, 4).Select(_ => Task.Run(() => { for (int i = 0; i < 1000; i++) counter.Add(); }));
await Task.WhenAll(tasks);
Console.WriteLine(counter.Value);

class Counter
{
    private readonly object _gate = new();
    private int _value;
    public void Add() { lock (_gate) _value++; }
    public int Value { get { lock (_gate) return _value; } }
}
~~~
~~~console
4000
~~~
