@@ref id="cl-kinds" cat="C" title="Виды типов: class, struct, record, interface, enum, delegate" cs="1.0" mem="O(размер)" tags="class struct record interface enum delegate виды типов ссылочный значимый выбор типа record class record struct когда что" topic="p1-encapsulation,p1-types" related="ty-struct,cl-records,cl-abstract-vs-interface,cl-events-delegates,ty-enum" learn="?dotnet/csharp/fundamentals/types/::Система типов C#"
В C# шесть видов пользовательских типов: класс, структура, запись, интерфейс, перечисление и делегат; выбор определяется тем, нужна ли ссылочная семантика, неизменяемость, равенство по значению и полиморфизм.

## Синтаксис {#syntax}

~~~csharp @nocheck
class Person { }                       // ссылочный, наследование
struct Point { public int X, Y; }      // значимый
record Order(int Id, string Name);     // ссылочный, равенство по значению
record struct Pair(int A, int B);      // значимый запись
interface IShape { double Area(); }    // контракт
enum Color { Red, Green }              // именованные константы
delegate int Op(int a, int b);         // тип метода
~~~

## Семантика {#semantics}

- **Класс** — ссылочный тип: переменная хранит ссылку, присваивание копирует ссылку, равенство по умолчанию — по ссылке. Поддерживает наследование (одиночное) и полиморфизм.
- **Структура** — значимый тип: копируется целиком, не наследуется, не бывает `null` ([подробнее](#/ref/b/ty-struct)).
- **Запись (`record`)** — класс (или структура) с автоматическим равенством по значению, `ToString`, деконструкцией и `with` ([подробнее](#/ref/c/cl-records)).
- **Интерфейс** — контракт без состояния (с C# 8 допускает реализации по умолчанию); тип реализует сколько угодно интерфейсов.
- **Перечисление** — набор констант на базе целого типа ([подробнее](#/ref/b/ty-enum)).
- **Делегат** — тип, описывающий сигнатуру метода; основа событий и лямбд ([подробнее](#/ref/c/cl-events-delegates)).
- Тип можно менять с одного вида на другой не всегда безболезненно: превращение класса в структуру меняет семантику копирования, а переход от `class` к `record` меняет равенство и `ToString`.
- **Как выбирать:** по умолчанию — класс; небольшое неизменяемое значение (точка, деньги, идентификатор) — структура; данные, которые сравниваются по содержимому (DTO) — запись; границы между компонентами — интерфейс.

## Под капотом {#internals}

Класс в куче — заголовок объекта + указатель на таблицу методов + поля. Структура хранится прямо в месте использования (стек, поле, массив). Интерфейс — таблица методов для диспетчеризации; делегат — объект с целью и указателем на метод; `enum` — обёртка над целым.

## Сложность {#complexity}

Доступ к полю класса — через ссылку, `O(1)`. Копирование структуры — `O(размер)`. Создание класса — аллокация и нагрузка на GC; структуры её не требуют (если не упаковываются).

## Версии {#versions}

- C# 1.0 — class, struct, interface, enum, delegate.
- C# 9 — `record` (класс); C# 10 — `record struct`, `readonly record struct`.
- C# 8 — реализации по умолчанию в интерфейсах.

## Ловушки {#pitfalls}

**Класс там, где нужно значение.** Два экземпляра с равными данными по умолчанию не равны.

~~~csharp
var a = new PersonC("Аня");
var b = new PersonC("Аня");
Console.WriteLine(a == b);                // ❌ False: сравниваются ссылки
var c = new PersonR("Аня");
var d = new PersonR("Аня");
Console.WriteLine(c == d);                // ✅ True: запись сравнивает значения

class PersonC { public string Name; public PersonC(string n) => Name = n; }
record PersonR(string Name);
~~~
~~~console
False
True
~~~

**Изменяемая структура.** Копии изменяются независимо, что запутывает.

**Интерфейс для всего подряд.** Интерфейс с одной реализацией часто лишь усложняет код.

**Запись с изменяемыми свойствами.** Равенство по значению и изменяемость плохо сочетаются (хеш-код меняется).

## Примеры {#examples}

~~~csharp
var p = new PersonR("Аня") with { Name = "Борис" };
Console.WriteLine(p);

IShape s = new Circle(2);
Console.WriteLine(s.Area().ToString("F2"));

Op add = (x, y) => x + y;
Console.WriteLine(add(2, 3));
Console.WriteLine(Color.Green);

record PersonR(string Name);
interface IShape { double Area(); }
class Circle(double r) : IShape { public double Area() => Math.PI * r * r; }
delegate int Op(int a, int b);
enum Color { Red, Green }
~~~
~~~console
PersonR { Name = Борис }
12.57
5
Green
~~~

@@ref id="cl-access" cat="C" title="Модификаторы доступа (public, internal, private, protected, file)" cs="1.0" mem="O(1)" tags="public private protected internal private protected protected internal file доступ инкапсуляция видимость InternalsVisibleTo" topic="p1-encapsulation" related="cl-modifiers,cl-nested,cl-inheritance" learn="dotnet/csharp/language-reference/keywords/accessibility-levels::Уровни доступа"
Модификатор доступа определяет, откуда виден тип или член: из любого кода (`public`), из своей сборки (`internal`), только из самого типа (`private`) или с учётом наследования (`protected`).

## Синтаксис {#syntax}

~~~csharp @nocheck
public class A { }                 // виден везде
internal class B { }               // в пределах сборки (по умолчанию для типов)
class C {
    private int a;                 // только внутри C (по умолчанию для членов)
    protected int b;               // C и наследники
    internal int c;                // сборка
    protected internal int d;      // сборка ИЛИ наследники
    private protected int e;       // наследники В ЭТОЙ сборке
}
file class Helper { }              // виден только в этом файле (C# 11)
~~~

## Семантика {#semantics}

- Шесть уровней членов: `public`, `private`, `protected`, `internal`, `protected internal` (ИЛИ), `private protected` (И). Для типов верхнего уровня допустимы `public`, `internal` и `file`.
- По умолчанию: верхнеуровневый тип — `internal`, вложенный тип и члены класса — `private`, члены интерфейса — `public`, члены `enum` — `public`.
- Доступность члена не может быть шире доступности его типа: публичный метод непубличного класса фактически виден только в сборке.
- Сигнатура публичного метода не может использовать менее доступные типы (ошибка CS0050/CS0051).
- Аксессоры свойства могут быть строже самого свойства: `public int X { get; private set; }`.
- `file` (C# 11) — тип виден только в исходном файле; удобен для генерируемого кода и вспомогательных типов, не загрязняя пространство имён.
- Доступ к `protected` члену — только через экземпляр производного класса, не через экземпляр базового.
- Хорошее правило: делать всё максимально закрытым и открывать по необходимости; поднять уровень доступа можно без поломки кода, опустить — нельзя.
- `[InternalsVisibleTo("Tests")]` открывает `internal` указанной сборке (часто — для тестов).

## Под капотом {#internals}

Уровни доступа — флаги в метаданных (`public`, `assembly`, `family`, `famorassem`, `famandassem`, `private`). Их проверяет компилятор и JIT/CLR при связывании; рефлексия может обойти `private`, если у кода есть права (`BindingFlags.NonPublic`).

## Сложность {#complexity}

На производительность не влияет: доступ проверяется при компиляции и загрузке; малые `private`/`internal` методы чаще встраиваются JIT.

## Версии {#versions}

- C# 1.0 — `public`, `private`, `protected`, `internal`, `protected internal`.
- C# 7.2 — `private protected`; C# 11 — `file`.
- C# 8 — модификаторы доступа в интерфейсах.

## Ловушки {#pitfalls}

**Ошибочно публичные поля.** Публичное поле не даёт добавить проверку позже без поломки API; используйте свойство.

~~~csharp
var a = new Account();
a.Balance = -100;                   // ❌ публичное поле: нет проверки
Console.WriteLine(a.Balance);

var b = new SafeAccount();
try { b.Balance = -100; }           // ✅ свойство проверяет значение
catch (ArgumentOutOfRangeException) { Console.WriteLine("отклонено"); }

class Account { public decimal Balance; }
class SafeAccount
{
    private decimal _b;
    public decimal Balance { get => _b; set => _b = value >= 0 ? value : throw new ArgumentOutOfRangeException(nameof(value)); }
}
~~~
~~~console
-100
отклонено
~~~

**`protected internal` читают как «и».** Это «или»; «и» — `private protected`.

**Всё `public` по привычке.** Чем больше открыто, тем сложнее менять.

**Рефлексия не уважает `private`**, поэтому секреты в private-полях не защищены.

## Примеры {#examples}

~~~csharp
var acc = new Acc(100);
acc.Deposit(50);
Console.WriteLine(acc.Total);

var d = new Derived();
Console.WriteLine(d.Show());

class Acc
{
    public decimal Total { get; private set; }
    public Acc(decimal start) => Total = start;
    public void Deposit(decimal x) => Total += x;
}
class Base { protected string Secret = "секрет"; private protected int Id = 7; }
class Derived : Base { public string Show() => $"{Secret} {Id}"; }
~~~
~~~console
150
секрет 7
~~~

@@ref id="cl-modifiers" cat="C" title="Модификаторы типов: static, sealed, abstract, partial" cs="1.0" mem="O(1)" tags="static sealed abstract partial статический класс запечатанный абстрактный partial class partial method static constructor extension" topic="p1-encapsulation,p1-inheritance" related="cl-inheritance,cl-abstract-vs-interface,cl-constructors,cl-access" learn="dotnet/csharp/language-reference/keywords/static::Ключевое слово static"
Модификаторы `static`, `sealed`, `abstract` и `partial` задают роль типа: набор статических членов без экземпляров, запрет наследования, незавершённая основа для наследников и разбиение определения по файлам.

## Синтаксис {#syntax}

~~~csharp @nocheck
static class Util { public static int Twice(int x) => x * 2; }
sealed class Final { }
abstract class Shape { public abstract double Area(); }
partial class Order { }  partial class Order { }      // одно определение в двух файлах
partial void OnChanged();                              // partial-метод
public partial string Name { get; set; }               // partial-свойство (C# 13)
~~~

## Семантика {#semantics}

- **`static class`** содержит только статические члены, не создаётся, не наследуется, неявно `sealed abstract`. Для вспомогательных функций и методов расширения.
- **`static` члены** принадлежат типу, а не экземпляру; доступ — `Тип.Член`. Статический конструктор выполняется один раз перед первым использованием типа.
- **`sealed`** запрещает наследование класса (или дальнейшее переопределение члена: `sealed override`). Структуры запечатаны всегда.
- **`abstract`** класс нельзя создать напрямую; он может содержать абстрактные члены без тела, которые обязаны реализовать наследники.
- **`partial`** — определение разбито на части в разных файлах одной сборки; все части собираются в один тип. Используется генераторами кода, дизайнерами форм, источниками (source generators).
- `partial void M();` — необязательный метод: если реализации нет, вызовы удаляются. С C# 9 допустимы partial-методы с модификаторами доступа и возвращаемыми значениями (обязаны иметь реализацию).
- `partial`-свойства и индексаторы — C# 13.
- `static abstract` члены интерфейсов (C# 11) — основа обобщённой математики.
- Класс может быть одновременно `sealed partial`, но не `static abstract` вручную; а `abstract` и `sealed` вместе недопустимы, потому что противоречат друг другу.

## Под капотом {#internals}

`static class` в IL — `abstract sealed` класс. Статические поля хранятся в «статической области» типа; обращение к ним может требовать проверки инициализации типа (`beforefieldinit`). `sealed` помогает JIT: вызовы виртуальных методов запечатанного типа **девиртуализируются** и могут встраиваться.

## Сложность {#complexity}

Вызов статического метода — самый дешёвый (без таблицы методов). `sealed` даёт небольшой выигрыш за счёт девиртуализации. Статическое состояние — глобальное: усложняет тесты и параллельность.

## Версии {#versions}

- C# 1.0 — `static class`, `sealed`, `abstract`; C# 2.0 — `partial`, статические конструкторы в классах.
- C# 9 — расширенные partial-методы; C# 11 — `static abstract`; C# 13 — partial-свойства.

## Ловушки {#pitfalls}

**Изменяемое статическое состояние.**

~~~csharp
Console.WriteLine(Counter.Next());
Console.WriteLine(Counter.Next());       // ❌ состояние разделено на весь процесс и все потоки
var t = Parallel.For(0, 1000, _ => Counter.Next());
Console.WriteLine(Counter.Next() <= 1003);   // значение зависит от гонки потоков

static class Counter { private static int n; public static int Next() => ++n; }
~~~
~~~console
1
2
True
~~~

**Порядок статических инициализаторов** между типами не определён строго.

**`sealed` в библиотеках.** Запечатывайте классы, не рассчитанные на наследование.

**Статические классы мешают тестам**: их нельзя подменить.

## Примеры {#examples}

~~~csharp
Console.WriteLine(Util.Twice(21));
Shape s = new Sq(3);
Console.WriteLine(s.Area());
Console.WriteLine(new Sq(2).Describe());

static class Util { public static int Twice(int x) => x * 2; }
abstract class Shape
{
    public abstract double Area();
    public string Describe() => $"{GetType().Name} {Area()}";
}
sealed class Sq(double a) : Shape { public override double Area() => a * a; }
~~~
~~~console
42
9
Sq 4
~~~

@@ref id="cl-fields" cat="C" title="Поля: экземпляра, статические, readonly, volatile" cs="1.0" mem="O(1)" tags="поле field static readonly volatile инициализатор порядок инициализации конструктор базового класса fixed buffer" topic="p1-encapsulation" related="ty-const-readonly,cl-constructors,cl-properties,ty-defaults" learn="dotnet/csharp/programming-guide/classes-and-structs/fields::Поля"
Поле — переменная, объявленная прямо в типе; поля экземпляра принадлежат объекту, статические — типу, и все получают значение по умолчанию до выполнения инициализаторов.

## Синтаксис {#syntax}

~~~csharp @nocheck
class Order
{
    private int _id;                          // поле экземпляра
    public static int Count;                  // статическое
    private readonly List<int> _lines = new();   // с инициализатором
    private volatile bool _stop;              // для межпоточной видимости
    public const int Max = 10;                // константа
}
~~~

## Семантика {#semantics}

- Поля инициализируются нулями ([значения по умолчанию](#/ref/b/ty-defaults)), затем выполняются **инициализаторы полей** в порядке записи, затем конструктор. Для производного класса порядок: инициализаторы производного → конструктор базового → тело конструктора производного.
- Инициализатор поля не может использовать другие поля экземпляра или `this` (до C# 12 с первичными конструкторами — параметры).
- `static`-поля инициализируются один раз при первом обращении к типу (статический конструктор).
- `readonly` ограничивает присваивание конструктором ([подробнее](#/ref/b/ty-const-readonly)).
- Порядок полей в коде важен только для инициализаторов (они выполняются сверху вниз); порядок в памяти определяет рантайм.
- `volatile` предотвращает некоторые переупорядочения чтения и записи: подходит для простых флагов; для атомарных операций — `Interlocked`.
- Поле, на которое нужны только чтение из других типов, делают приватным и открывают свойством; так добавление проверки или события не ломает вызывающий код.
- Публичные поля обычно заменяют свойствами: поле не может быть частью интерфейса, нельзя добавить проверку или `virtual`.
- Большое число полей одного типа удобно заменять массивом или вложенным типом; поля `bool` подряд занимают по байту каждое, а флаги лучше хранить битовой маской.
- Структуры: поля должны быть определённо присвоены до использования `this` (C# 11 смягчило правило).
- `fixed`-буферы и `[InlineArray]` задают массивы фиксированного размера внутри структур.

## Под капотом {#internals}

Поля экземпляра лежат в объекте друг за другом (CLR переупорядочивает их для плотности, `[StructLayout]` управляет раскладкой); статические — в области типа. Доступ к полю — смещение от адреса объекта. Инициализаторы компилируются в начало каждого конструктора.

## Сложность {#complexity}

`O(1)`. Порядок полей влияет на размер объекта из-за выравнивания: пара `bool` и `long` занимает 16 байт вместо 9.

## Версии {#versions}

- C# 1.0 — поля; C# 6 — инициализаторы свойств рядом с полями.
- C# 12 — первичные конструкторы позволяют использовать параметры в инициализаторах.
- C# 14 — ключевое слово `field` для доступа к автоматическому полю свойства.

## Ловушки {#pitfalls}

**Виртуальный вызов из конструктора видит ещё не заданные поля.** Инициализаторы полей производного класса уже выполнены, а присваивания в теле его конструктора — нет.

~~~csharp
var d = new Derived();
Console.WriteLine(d.Name);

class Base { public Base() => Init(); protected virtual void Init() { } }
class Derived : Base
{
    private string _name;
    private string _ready = "инициализатор";
    public string Name => _name;
    public Derived() { _name = "задано"; }
    protected override void Init() => Console.WriteLine($"name={_name ?? "null"}, ready={_ready}");
}
~~~
~~~console
name=null, ready=инициализатор
задано
~~~

**Публичные изменяемые поля** ломают инкапсуляцию.

**`volatile` вместо блокировки.** Составные операции (`i++`) остаются неатомарными.

**Статические поля и тесты.** Состояние сохраняется между запусками тестов.

## Примеры {#examples}

~~~csharp
var a = new Order();
var b = new Order();
Console.WriteLine(Order.Count);
Console.WriteLine(a.Id + " " + b.Id);

class Order
{
    public static int Count;
    public readonly int Id;
    public Order() { Id = ++Count; }
}
~~~
~~~console
2
1 2
~~~

@@ref id="cl-properties" cat="C" title="Свойства: auto, init, required, field, expression-bodied" cs="1.0" mem="O(1)" tags="свойство property auto-property get set init required field expression-bodied computed вычисляемое lazy private set partial" topic="p1-encapsulation" related="cl-fields,cl-indexers,cl-records,ty-const-readonly" learn="dotnet/csharp/programming-guide/classes-and-structs/properties::Свойства"
Свойство выглядит как поле, но состоит из методов доступа `get` и `set`, поэтому может проверять значение, вычислять его и ограничивать доступ.

## Синтаксис {#syntax}

~~~csharp @nocheck
public string Name { get; set; }                       // автосвойство
public int Id { get; }                                  // только чтение (в конструкторе)
public int Age { get; private set; }
public string City { get; init; } = "";                 // только при создании (C# 9)
public required string Title { get; init; }             // обязательное (C# 11)
public double Area => Width * Height;                   // вычисляемое
public string Trim { get; set => field = value.Trim(); } = "";   // C# 14: field
~~~

## Семантика {#semantics}

- **Автосвойство** — компилятор создаёт скрытое поле; `get; set;` — чтение и запись, `get;` — только чтение (присваивается в конструкторе или инициализаторе).
- **`init`** допускает присваивание только в конструкторе, инициализаторе объекта и `with`; после создания объект неизменяем.
- **`required`** обязывает инициализировать свойство при создании (`new X { Title = "…" }`) — компилятор выдаст ошибку, если его пропустить.
- **Вычисляемое** свойство `=> выражение` не хранит значения и считается при каждом обращении.
- **`field`** (C# 14) — доступ к скрытому полю в теле аксессора без объявления собственного поля.
- Аксессоры могут иметь разные уровни доступа: `public get; private set;`.
- Для коллекций хороший приём — публичное `IReadOnlyList<T>` при приватном списке: внешний код читает, но не меняет состав.
- Для проверки значения в `set` бросайте `ArgumentException`-семейство исключений, а не молча игнорируйте некорректный ввод.
- Свойства могут быть `virtual`, `abstract`, входить в интерфейсы, быть `static`; `partial`-свойства — C# 13.
- Ссылаться на свойство через `ref`/`out` нельзя (его нет в памяти как переменной).
- Обращение к свойству должно быть дешёвым и без побочных эффектов: вызывающий считает его «просто значением».

## Под капотом {#internals}

Свойство компилируется в пару методов `get_Имя` и `set_Имя` (`init` — с модификатором `modreq(IsExternalInit)`) и скрытое поле `<Имя>k__BackingField`. Простые аксессоры JIT встраивает, поэтому автосвойство ничем не медленнее поля.

## Сложность {#complexity}

Автосвойство — `O(1)` как поле (после встраивания). Вычисляемое свойство стоит столько же, сколько его выражение при каждом чтении.

## Версии {#versions}

- C# 1.0 — свойства; C# 3.0 — автосвойства; C# 6 — инициализаторы и `get;`-only, `=>` для свойств.
- C# 9 — `init`; C# 11 — `required`; C# 13 — partial-свойства; C# 14 — `field`.

## Ловушки {#pitfalls}

**Тяжёлое или побочное вычисление в геттере.**

~~~csharp
var r = new Report();
Console.WriteLine(r.Total);
Console.WriteLine(r.Total);                // ❌ вычисляется заново при каждом чтении
Console.WriteLine(Report.Calls);

var t = new Temp { C = 100 };
Console.WriteLine(t.F);

class Report
{
    public static int Calls;
    public int Total { get { Calls++; return Enumerable.Range(1, 1000).Sum(); } }
}
class Temp { public double C { get; init; } public double F => C * 9 / 5 + 32; }
~~~
~~~console
500500
500500
2
212
~~~

**Бесконечная рекурсия.** `set { Name = value; }` вызывает сам себя; нужно поле или `field`.

**Изменяемая структура в свойстве.** `obj.Point.X = 1` изменит копию (CS1612).

**Автосвойство-коллекция.** `get;` не защищает содержимое списка; отдавайте `IReadOnlyList<T>`.

## Примеры {#examples}

~~~csharp
var u = new User { Name = "  Аня ", Email = "a@x.ru" };
Console.WriteLine($"[{u.Name}] {u.Email}");
u.Birthday = new DateTime(2000, 1, 1);
Console.WriteLine(u.Age > 20);

class User
{
    public required string Email { get; init; }
    public string Name { get; set => field = value.Trim(); } = "";
    public DateTime Birthday { get; set; }
    public int Age => DateTime.Today.Year - Birthday.Year;
}
~~~
~~~console
[Аня] a@x.ru
True
~~~
