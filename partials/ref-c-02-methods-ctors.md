@@ref id="cl-indexers" cat="C" title="Индексаторы" cs="1.0" cx="O(1)" mem="O(1)" tags="индексатор indexer this[] Item Index Range многомерный индексатор string indexer ref indexer интерфейс" topic="p1-encapsulation,p2-list" related="cl-properties,op-range-index,ty-arrays" learn="?dotnet/csharp/programming-guide/indexers/::Индексаторы"
Индексатор позволяет обращаться к объекту через квадратные скобки, как к массиву: `obj[i]`; технически это свойство с параметрами и именем `this`.

## Синтаксис {#syntax}

~~~csharp @nocheck
public T this[int index] { get => _items[index]; set => _items[index] = value; }
public string this[string key] => _map[key];            // только чтение
public double this[int row, int col] { get; set; }      // несколько параметров
public ref T this[int i] => ref _items[i];              // ссылка на элемент
public T this[Index i] => _items[i];                    // поддержка ^1
~~~

## Семантика {#semantics}

- Индексатор может иметь любой набор параметров любых типов и быть перегружен по типам параметров; поддерживает `get`, `set`, `init` и разные уровни доступа аксессоров.
- Индексатор не может быть `static`. Его можно объявлять в интерфейсах и делать `virtual`/`abstract`.
- Для обращений `obj[^1]` и `obj[1..3]` тип должен предоставлять `Length` или `Count` и индексатор по `int` (для `^`) либо метод `Slice(int, int)` (для диапазонов) — иначе нужен явный индексатор по `Index`/`Range`.
- Индексатор не должен скрывать дорогие операции: вызывающий ожидает `O(1)`, как у массива.
- Имя в метаданных — `Item`; его можно изменить атрибутом `[IndexerName("Имя")]`.
- Нельзя передать индексатор как `ref`/`out` аргумент (кроме `ref`-возвращающих индексаторов, которые возвращают ссылку).
- С C# 13 индексатор «от конца» допустим в инициализаторах объектов: `new C { [^1] = x }`.
- Для словарей индексатор на чтение бросает `KeyNotFoundException`, на запись — добавляет или заменяет значение; для безопасного чтения — `TryGetValue`.

## Под капотом {#internals}

Компилируется в пару методов `get_Item` и `set_Item`. Вызов `obj[i]` — обычный (виртуальный) вызов метода; для массивов и `Span<T>` JIT выдаёт прямое обращение к памяти с проверкой границ.

## Сложность {#complexity}

Индексатор — обычный метод, поэтому его стоимость определяется реализацией, а не синтаксисом скобок. Определяется реализацией; для `List<T>` и массивов — `O(1)`, для `Dictionary` — `O(1)` в среднем, для связанного списка `LinkedList` — индексатора нет именно из-за `O(n)`.

## Версии {#versions}

- C# 1.0 — индексаторы; C# 6 — `=>` для индексаторов.
- C# 7.0 — `ref`-возвращающие индексаторы; C# 8 — поддержка `Index` и `Range`.
- C# 13 — `^` в инициализаторах объектов.

## Ловушки {#pitfalls}

**Индексатор без проверки границ.**

~~~csharp
var g = new Grid(2, 2);
g[0, 1] = 5;
Console.WriteLine(g[0, 1]);
try { Console.WriteLine(g[5, 5]); }      // ❌ без проверки поймаем только внутреннее исключение
catch (IndexOutOfRangeException e) { Console.WriteLine("за границами: " + e.GetType().Name); }

class Grid
{
    private readonly int[,] _d;
    public Grid(int r, int c) => _d = new int[r, c];
    public int this[int r, int c] { get => _d[r, c]; set => _d[r, c] = value; }
}
~~~
~~~console
5
за границами: IndexOutOfRangeException
~~~

**Медленный индексатор.** Перебор по индексу с `O(n)` на каждый вызов даёт `O(n²)`.

**Изменение копии структуры.** Индексатор, возвращающий структуру, отдаёт копию.

**Перегрузки по `int` и `Index`** могут вызывать неоднозначность при `null`-литералах.

## Примеры {#examples}

~~~csharp
var p = new Poly(1, 2, 3);
Console.WriteLine(p[0] + " " + p[^1]);
p[1] = 20;
Console.WriteLine(string.Join(",", p.Items));

var m = new Matrix();
m["a"] = 1;
Console.WriteLine(m["a"] + m["missing"]);

class Poly(params int[] c)
{
    public int[] Items => c;
    public int this[int i] { get => c[i]; set => c[i] = value; }
    public int Length => c.Length;
}
class Matrix
{
    private readonly Dictionary<string, int> _d = new();
    public int this[string k] { get => _d.GetValueOrDefault(k); set => _d[k] = value; }
}
~~~
~~~console
1 3
1,20,3
1
~~~

@@ref id="cl-methods" cat="C" title="Методы и параметры: ref/out/in, params, optional, named" cs="1.0" cx="O(1)" mem="O(1)" tags="метод параметры params optional необязательные именованные аргументы перегрузка ref out in expression-bodied разрешение перегрузок" topic="p1-methods" related="op-ref-out-in,cl-local-closures,cl-extension,op-lambda" learn="dotnet/csharp/programming-guide/classes-and-structs/methods::Методы"
Метод — именованный блок кода с параметрами и возвращаемым значением; C# позволяет передавать параметры по значению, по ссылке, пропускать необязательные и называть аргументы.

## Синтаксис {#syntax}

~~~csharp @nocheck
int Add(int a, int b) { return a + b; }
int Twice(int x) => x * 2;                       // expression-bodied
void Log(string msg, int level = 1, bool flag = false) { }
Log("x", flag: true);                            // именованный аргумент
int Sum(params int[] xs)  /  Sum(params ReadOnlySpan<int> xs)   // C# 13
void Swap(ref int a, ref int b)   bool TryGet(out int v)   double Len(in Vec v)
static ref int First(int[] a) => ref a[0];
~~~

## Семантика {#semantics}

- По умолчанию аргументы передаются **по значению**: для ссылочных типов копируется ссылка (объект общий), для структур — вся структура. `ref`, `out`, `in` передают по ссылке ([подробнее](#/ref/a/op-ref-out-in)).
- `params` — последний параметр принимает любое число аргументов; вызов превращается в создание массива (в C# 13 — также `Span`, `List<T>`, `IEnumerable<T>`).
- **Необязательные параметры** подставляются **компилятором в вызывающем коде**: значение запекается в сборку-потребитель. Значение по умолчанию — константа времени компиляции или `default`.
- **Именованные аргументы** вычисляются в порядке записи, а не параметров; позиционные не могут идти после именованных, кроме случая, когда имена стоят на своих местах.
- **Перегрузка:** методы с одним именем и разными списками параметров (тип, число, `ref/out`); возвращаемый тип в сигнатуру не входит. Компилятор выбирает «лучшее» преобразование аргументов; при равенстве — ошибка неоднозначности (CS0121).
- Метод без `return` возвращает `void`; `async`-методы возвращают `Task`/`ValueTask`.
- Рекурсия допустима; глубину стека ограничивает размер стека потока (~1 МБ).
- Параметры могут быть `scoped`, а структуры — с `readonly`-методами (C# 8) для гарантии неизменности.

## Под капотом {#internals}

Метод — IL-метод с кадром на стеке: параметры и локальные переменные. Аргументы передаются в регистрах и/или стеке по ABI платформы. JIT встраивает короткие методы (`AggressiveInlining` подсказывает). Вызов виртуального метода идёт через таблицу методов.

## Сложность {#complexity}

Вызов обычного метода — единицы наносекунд, встраиваемый — бесплатно. `params` с массивом — аллокация на вызов (до C# 13 нет альтернативы, кроме ручных перегрузок).

## Версии {#versions}

- C# 1.0 — методы, `ref`, `out`, `params`; C# 4.0 — необязательные и именованные параметры.
- C# 6 — `=>` для методов; C# 7 — локальные функции, `out var`, `ref` возвращаемые.
- C# 7.2 — `in`; C# 13 — `params` для коллекций.

## Ловушки {#pitfalls}

**Значение необязательного параметра «запекается» в вызывающую сборку.** Если библиотека поменяет умолчание, старые клиенты продолжат использовать прежнее до пересборки. Для открытого API предпочитайте перегрузки.

~~~csharp
Console.WriteLine(F.Fmt(5));
Console.WriteLine(F.Fmt(5, width: 6));
Console.WriteLine(F.Fmt("a", "b", "c"));
Console.WriteLine(F.Fmt());

static class F
{
    public static string Fmt(int n, int width = 3) => n.ToString().PadLeft(width, '.');
    public static string Fmt(params string[] parts) => string.Join("-", parts);
}
~~~
~~~console
..5
.....5
a-b-c
~~~

**Изменение параметра-структуры не влияет на вызывающего;** изменение полей объекта — влияет.

**`params` и `null`.** `Sum(null)` передаёт `null`-массив, а не пустой.

**Слишком много параметров.** Больше четырёх-пяти — повод ввести объект параметров или запись.

## Примеры {#examples}

~~~csharp
Console.WriteLine(Area(w: 3, h: 4));
Console.WriteLine(Max(3, 9, 5));

int total = 0;
Accumulate(ref total, 5);
Accumulate(ref total, 7);
Console.WriteLine(total);

static double Area(double h, double w) => h * w;
static int Max(params int[] xs) => xs.Max();
static void Accumulate(ref int sum, int x) => sum += x;
~~~
~~~console
12
9
12
~~~

@@ref id="cl-constructors" cat="C" title="Конструкторы: по умолчанию, цепочки, первичные, статические" cs="1.0" cx="O(1)" mem="O(размер)" tags="конструктор constructor this base первичный конструктор primary static constructor init порядок инициализации SetsRequiredMembers private constructor" topic="p1-encapsulation,p1-inheritance" related="cl-fields,cl-properties,cl-inheritance,cl-records" learn="dotnet/csharp/programming-guide/classes-and-structs/constructors::Конструкторы"
Конструктор — специальный метод, который создаёт и инициализирует объект при `new`; в классе может быть несколько перегрузок, цепочки вызовов, статический конструктор и (с C# 12) первичный.

## Синтаксис {#syntax}

~~~csharp @nocheck
class P {
    public P() : this("без имени") { }                // цепочка в тот же класс
    public P(string name) { Name = name; }
    static P() { /* один раз на тип */ }
    private P(int x) { }                              // закрытый (фабрики, синглтоны)
}
class D : P { public D(string n) : base(n) { } }      // вызов базового
class S(string name, int age) { public string Name => name; }   // первичный (C# 12)
record R(int Id);                                      // у записи свой первичный
~~~

## Семантика {#semantics}

- Если конструкторов нет, компилятор добавляет публичный без параметров. Как только объявлен любой другой, конструктор без параметров не создаётся.
- Порядок для `new D()`: инициализаторы полей `D` → конструктор `B` (базового) → тело конструктора `D`. Если `: base(...)` не указан, вызывается конструктор базового без параметров.
- `: this(...)` передаёт управление другому конструктору того же класса; общую логику выносят в один «главный» конструктор.
- **Первичный конструктор** (C# 12): параметры видны во всём теле типа, но **не становятся полями или свойствами**; компилятор создаёт скрытое поле только если параметр используется после конструктора. Для классов, в отличие от записей, свойств не создаётся.
- **Статический конструктор** выполняется один раз, до первого создания экземпляра или обращения к статическому члену; без параметров и модификаторов доступа; исключение в нём делает тип непригодным (`TypeInitializationException`).
- Конструктор не должен вызывать виртуальные методы: производный класс ещё не завершил инициализацию.
- `private` конструктор запрещает создание снаружи (одиночка, статические фабричные методы).
- Для структур: конструктор без параметров разрешён с C# 10, но `default` его не вызывает.
- Конструктор может бросать исключения — объект при этом не создаётся, но финализатор всё равно сработает.

## Под капотом {#internals}

`new C()` в IL — `newobj` (выделение памяти и вызов `.ctor`). Статический конструктор — метод `.cctor`, запускаемый CLR при первом обращении (или при загрузке типа, если нет `beforefieldinit`). Инициализаторы полей вставляются в начало каждого конструктора, не вызывающего `this(...)`.

## Сложность {#complexity}

`O(1)` плюс выделение памяти `O(размер объекта)`. Цепочки конструкторов не дублируют работу, если инициализаторы полей выполняются один раз.

## Версии {#versions}

- C# 1.0 — конструкторы; C# 2.0 — статические конструкторы в классах.
- C# 9 — записи с первичным конструктором; C# 10 — конструкторы структур без параметров.
- C# 11 — `required`, `[SetsRequiredMembers]`; C# 12 — первичные конструкторы для классов и структур.

## Ловушки {#pitfalls}

**Первичный конструктор не создаёт свойств.**

~~~csharp
var s = new Svc("db");
Console.WriteLine(s.Describe());
// Console.WriteLine(s.name);          // ❌ CS1061: параметр — не член типа
var r = new Rec("db");
Console.WriteLine(r.Name);             // ✅ у record свойство создаётся

class Svc(string name) { public string Describe() => "сервис " + name; }
record Rec(string Name);
~~~
~~~console
сервис db
db
~~~

**Порядок инициализации и виртуальные вызовы** — см. [поля](#/ref/c/cl-fields).

**Исключение в статическом конструкторе** «ломает» тип на всё время жизни процесса.

**Дублирование логики** в нескольких конструкторах вместо цепочки.

## Примеры {#examples}

~~~csharp
var a = new Pt();
var b = new Pt(3);
var c = new Pt(3, 4);
Console.WriteLine($"{a} {b} {c}");
Console.WriteLine(Pt.Created);

var d = new Derived();
class Pt
{
    public static int Created;
    public int X { get; }
    public int Y { get; }
    static Pt() => Console.WriteLine("статический конструктор");
    public Pt() : this(0, 0) { }
    public Pt(int x) : this(x, 0) { }
    public Pt(int x, int y) { X = x; Y = y; Created++; }
    public override string ToString() => $"({X},{Y})";
}
class Base { public Base() => Console.WriteLine("Base"); }
class Derived : Base { int f = Init(); public Derived() => Console.WriteLine("Derived");
    static int Init() { Console.WriteLine("поле Derived"); return 1; } }
~~~
~~~console
статический конструктор
(0,0) (3,0) (3,4)
3
поле Derived
Base
Derived
~~~

@@ref id="cl-dispose" cat="C" title="Освобождение ресурсов: IDisposable, using, финализаторы" cs="1.0" cx="O(1)" mem="O(1)" danger="1" tags="IDisposable Dispose using await using IAsyncDisposable финализатор деструктор SuppressFinalize SafeHandle освобождение ресурсов утечка dispose pattern" topic="p1-exceptions,p1-types" related="cl-events-delegates,cl-constructors" learn="dotnet/standard/garbage-collection/implementing-dispose::Реализация метода Dispose"
`IDisposable.Dispose` освобождает неуправляемые ресурсы (файлы, сокеты, соединения) детерминированно, `using` гарантирует его вызов, а финализатор — запасной вариант, который срабатывает при сборке мусора.

## Синтаксис {#syntax}

~~~csharp @nocheck
using (var f = File.OpenRead(p)) { }          // классический using
using var g = File.OpenRead(p);               // using-объявление (C# 8): до конца блока
await using var c = new Conn();               // IAsyncDisposable (C# 8)
class R : IDisposable { public void Dispose() { /* освободить */ } }
~R() { }                                       // финализатор (редко нужен)
~~~

## Семантика {#semantics}

- `using` разворачивается в `try/finally`: `Dispose` вызывается и при исключении. Порядок освобождения — обратный объявлению.
- `Dispose` должен быть **идемпотентным**: повторный вызов безопасен. После `Dispose` обращения к объекту бросают `ObjectDisposedException`.
- **Финализатор** (`~Имя`) вызывается сборщиком мусора, время непредсказуемо; нужен только классам, напрямую владеющим неуправляемым ресурсом. Для таких случаев лучше `SafeHandle`, а не собственный финализатор.
- Классический шаблон: `Dispose()` вызывает `Dispose(true)` и `GC.SuppressFinalize(this)`; финализатор вызывает `Dispose(false)`. Для запечатанных классов без неуправляемых ресурсов шаблон упрощается.
- `IAsyncDisposable.DisposeAsync` — для ресурсов с асинхронным закрытием (потоки, соединения); применяется через `await using`.
- Объект, созданный в `using`, не следует возвращать или хранить: он будет освобождён при выходе из блока.
- Подписки на события и статические коллекции тоже удерживают объекты ([события](#/ref/c/cl-events-delegates)): `Dispose` — место, где их нужно снять.
- `using` допустим для `ref struct` с методом `Dispose()` (без интерфейса).
- Если класс владеет полями-`IDisposable`, он сам должен реализовать `IDisposable` и освободить их в своём `Dispose`: ответственность за освобождение следует за владением.

## Под капотом {#internals}

Объекты с финализатором при создании попадают в очередь финализации; после первой сборки они «выживают» до вызова финализатора и освобождаются лишь следующей сборкой старшего поколения — дороже обычных объектов. `GC.SuppressFinalize` убирает объект из очереди. Финализаторы выполняются в отдельном потоке.

## Сложность {#complexity}

Стоимость вызова `Dispose` — это стоимость самого освобождения ресурса, а не самого вызова. `Dispose` — стоимость самого освобождения. Финализируемые объекты замедляют сборку мусора и задерживают освобождение памяти минимум на одну сборку.

## Версии {#versions}

- C# 1.0 — `IDisposable`, `using`, финализаторы; C# 8 — `using var`, `IAsyncDisposable`, `await using`.
- .NET Core 3.0 — `DisposeAsync`; C# 8 — `ref struct` с `Dispose`.

## Ловушки {#pitfalls}

**Забытый `Dispose`.**

~~~csharp
var r1 = new Res("A");
r1.Use();                              // ❌ без Dispose ресурс закроется неизвестно когда
using (var r2 = new Res("B")) { r2.Use(); }      // ✅ Dispose вызван сразу
using var r3 = new Res("C");
r3.Use();
Console.WriteLine("конец метода");

class Res(string n) : IDisposable
{
    public void Use() => Console.WriteLine("использую " + n);
    public void Dispose() => Console.WriteLine("освобождаю " + n);
}
~~~
~~~console
использую A
использую B
освобождаю B
использую C
конец метода
освобождаю C
~~~

**Собственный финализатор без необходимости** замедляет сборку; пользуйтесь `SafeHandle`.

**`Dispose` не освобождает управляемую память** — это делает GC; `Dispose` закрывает внешние ресурсы.

**Исключение в `Dispose`** во время обработки другого исключения может его затереть.

## Примеры {#examples}

~~~csharp
using (var a = new Res("A"))
using (var b = new Res("B"))
{
    Console.WriteLine("внутри");
}
Console.WriteLine("после using");

await using (var c = new AsyncRes())
{
    Console.WriteLine("асинхронный ресурс");
}

class Res(string n) : IDisposable { public void Dispose() => Console.WriteLine("Dispose " + n); }
class AsyncRes : IAsyncDisposable
{
    public async ValueTask DisposeAsync() { await Task.Delay(1); Console.WriteLine("DisposeAsync"); }
}
~~~
~~~console
внутри
Dispose B
Dispose A
после using
асинхронный ресурс
DisposeAsync
~~~

@@ref id="cl-events-delegates" cat="C" title="Делегаты и события" cs="1.0" cx="O(n)" mem="O(n)" danger="1" tags="delegate event делегат событие Action Func EventHandler multicast подписка отписка утечка памяти Invoke GetInvocationList" topic="p1-interfaces,p2-linq" related="op-lambda,cl-local-closures,cl-dispose" learn="?dotnet/csharp/programming-guide/events/::События"
Делегат — объект, хранящий ссылку на метод (или цепочку методов); событие — делегат с ограничением: снаружи на него можно только подписаться или отписаться, но не вызвать и не перезаписать.

## Синтаксис {#syntax}

~~~csharp @nocheck
delegate int Op(int a, int b);                      // объявление делегата
Func<int, int> f = x => x * 2;   Action<string> a = Console.WriteLine;
public event EventHandler<MsgArgs>? Received;       // событие
Received?.Invoke(this, new MsgArgs("hi"));          // вызов (только внутри класса)
obj.Received += Handler;   obj.Received -= Handler; // подписка/отписка
~~~

## Семантика {#semantics}

- Делегат — неизменяемый объект: цель (`Target`) и метод (`Method`). Присваивание копирует ссылку.
- **Мультикаст:** `+=` создаёт новый делегат с цепочкой (`invocation list`); вызов выполняет обработчики по порядку. Результат — значение последнего. Исключение в обработчике прерывает остальных.
- `event` ограничивает доступ: вне класса доступны только `+=` и `-=`; вызывать и обнулять можно лишь внутри объявившего типа.
- Стандарт: `EventHandler<TEventArgs>` с сигнатурой `(object? sender, TEventArgs e)`.
- Вызов события `Event?.Invoke(...)` безопасен для многопоточности: ссылка копируется во временную переменную.
- Для отписки нужен **тот же** делегат: отписаться лямбдой, написанной заново, нельзя — это другой объект; сохраните делегат в переменную.
- Подписчик держится в цепочке издателя: пока издатель жив, подписчик не будет собран (классическая утечка). Отписывайтесь в `Dispose`, используйте слабые события или `WeakReference`.
- `Action`, `Func<>`, `Predicate<T>` покрывают большинство случаев; собственный `delegate` — для читаемости.

## Под капотом {#internals}

Делегат — класс-наследник `MulticastDelegate` с полями `_target`, `_methodPtr` и списком вызова. Поле-событие — приватный делегат и пара аксессоров `add`/`remove`, реализованных через `Interlocked.CompareExchange` (потокобезопасно). Вызов делегата — вызов через указатель на метод, немного дороже прямого.

## Сложность {#complexity}

Делегаты и события дешёвы, пока цепочка коротка, а обработчики не захватывают лишнего. Вызов одного делегата — `O(1)`; цепочки — `O(k)` по числу обработчиков. Подписка копирует массив обработчиков: `O(k)`. Лямбда с захватом создаёт объект при каждом присваивании.

## Версии {#versions}

- C# 1.0 — делегаты и события; C# 2.0 — анонимные методы, вариантность делегатов (4.0).
- C# 3.0 — лямбды; C# 6 — `?.Invoke`.
- C# 9 — указатели на функции `delegate*` для unsafe-кода.

## Ловушки {#pitfalls}

**Отписка новой лямбдой не срабатывает.**

~~~csharp
var pub = new Pub();
pub.Fired += () => Console.WriteLine("лямбда");
pub.Fired -= () => Console.WriteLine("лямбда");     // ❌ другой объект: не отпишется
pub.Raise();

Action h = () => Console.WriteLine("handler");
pub.Fired += h;
pub.Fired -= h;                                     // ✅ тот же делегат
pub.Raise();

class Pub { public event Action? Fired; public void Raise() => Fired?.Invoke(); }
~~~
~~~console
лямбда
лямбда
~~~

**Утечки через подписки** на долгоживущие объекты (статические события, синглтоны).

**Исключение в обработчике** прерывает цепочку; для надёжности вызывайте `GetInvocationList()` и перехватывайте по одному.

**Обработчик, вызванный из другого потока**, обращается к UI не из своего потока.

## Примеры {#examples}

~~~csharp
var btn = new Button();
btn.Clicked += (s, e) => Console.WriteLine("первый " + e);
btn.Clicked += (s, e) => Console.WriteLine("второй " + e);
btn.Click("ok");

Func<int, int, int> add = (a, b) => a + b;
Console.WriteLine(add(2, 3));

Action chain = () => Console.Write("A ");
chain += () => Console.Write("B ");
chain += () => Console.Write("C ");
chain();
Console.WriteLine(chain.GetInvocationList().Length);

class Button
{
    public event EventHandler<string>? Clicked;
    public void Click(string arg) => Clicked?.Invoke(this, arg);
}
~~~
~~~console
первый ok
второй ok
5
A B C 3
~~~

@@ref id="cl-local-closures" cat="C" title="Локальные функции и замыкания" cs="7.0" cx="O(1)" mem="O(1)" tags="локальная функция local function замыкание closure захват переменной static local function рекурсия display class аллокация" topic="p1-methods,p2-linq" related="op-lambda,cl-events-delegates,cl-methods" learn="dotnet/csharp/programming-guide/classes-and-structs/local-functions::Локальные функции"
Локальная функция — метод, объявленный внутри другого метода; она видит его переменные (замыкание) и, в отличие от лямбды, не создаёт делегат, пока вы сами этого не потребуете.

## Синтаксис {#syntax}

~~~csharp @nocheck
int Sum(int[] a)
{
    int total = 0;
    Add();                                  // можно вызывать до объявления
    return total;
    void Add() { foreach (var x in a) total += x; }   // захватывает total и a
}
static int Sq(int x) => x * x;              // static: без захвата (C# 8)
async Task Run() { async Task Step() { await Task.Delay(1); } await Step(); }
~~~

## Семантика {#semantics}

- Видна только внутри объемлющего метода; может быть `async`, `unsafe`, `static`, иметь атрибуты (C# 9) и обобщённые параметры.
- **Замыкание:** локальная функция (и лямбда) захватывает *переменные*, а не их значения. Изменение захваченной переменной видно и снаружи, и внутри.
- `static` локальная функция не может захватывать: компилятор запретит использование локальных переменных и `this`. Это самый предсказуемый способ избежать аллокации.
- Локальная функция удобна для: валидации аргументов в итераторах и `async`-методах (проверка выполняется сразу, а не при первом `MoveNext`), рекурсии внутри метода, вспомогательных алгоритмов.
- Отличие от лямбды: имя, возможность рекурсии без хитростей, объявление в любой точке метода, нет автоматического делегата.
- Захваченные переменные циклов: `foreach` — отдельная на итерацию, `for` — общая ([лямбды](#/ref/a/op-lambda)).
- Если локальную функцию превращают в делегат (`Func<int> f = Local;`), создаётся объект делегата.

## Под капотом {#internals}

Если захвата нет, локальная функция становится обычным статическим методом. При захвате компилятор помещает переменные в структуру-замыкание, передаваемую по `ref` (без аллокации, если функция не превращается в делегат), либо в класс «display class» в куче (если захват нужен лямбде или делегату). Это одна из причин, почему локальные функции дешевле лямбд.

## Сложность {#complexity}

Сама по себе локальная функция ничего не стоит во время выполнения: это обычный метод, который компилятор может встроить. Вызов — как у обычного метода (часто встраивается). Захват лямбдой/делегатом — аллокация замыкания и делегата при каждом выполнении объявляющего кода.

## Версии {#versions}

- C# 7.0 — локальные функции; C# 8 — `static` локальные функции.
- C# 9 — атрибуты на локальных функциях; C# 10 — `[return: …]` и естественный тип лямбд.

## Ловушки {#pitfalls}

**Отложенная проверка аргументов в итераторах.**

~~~csharp
try { var seq = BadRange(5, -1); Console.WriteLine("итератор создан"); }   // ❌ исключения пока нет
catch (ArgumentOutOfRangeException) { Console.WriteLine("исключение при создании"); }
try { var seq = GoodRange(5, -1); }                                         // ✅ проверка сразу
catch (ArgumentOutOfRangeException) { Console.WriteLine("исключение при создании (Good)"); }

static IEnumerable<int> BadRange(int s, int c)
{
    if (c < 0) throw new ArgumentOutOfRangeException(nameof(c));
    for (int i = 0; i < c; i++) yield return s + i;
}
static IEnumerable<int> GoodRange(int s, int c)
{
    if (c < 0) throw new ArgumentOutOfRangeException(nameof(c));
    return Iter();
    IEnumerable<int> Iter() { for (int i = 0; i < c; i++) yield return s + i; }
}
~~~
~~~console
итератор создан
исключение при создании (Good)
~~~

**Неожиданный захват.** Локальная функция увидит изменения внешней переменной после объявления.

**Скрытые аллокации** при передаче локальной функции как делегата в горячем коде.

**Слишком большая локальная функция** — повод вынести в отдельный метод.

## Примеры {#examples}

~~~csharp
int Fact(int n)
{
    return Go(n);
    static int Go(int k) => k <= 1 ? 1 : k * Go(k - 1);
}
Console.WriteLine(Fact(5));

int counter = 0;
void Tick() => counter++;
Tick(); Tick(); Tick();
Console.WriteLine(counter);

Func<int> make = Make();
Console.WriteLine(make() + " " + make());
static Func<int> Make() { int x = 0; return () => ++x; }
~~~
~~~console
120
3
1 2
~~~
