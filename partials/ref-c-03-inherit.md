@@ref id="cl-extension" cat="C" title="Методы расширения и блоки extension" cs="3.0" cx="O(1)" mem="O(1)" tags="extension method метод расширения this статический класс extension блок C# 14 LINQ расширение свойства" topic="p2-linq,p1-methods" related="cl-methods,op-null-conditional,cl-modifiers" learn="dotnet/csharp/programming-guide/classes-and-structs/extension-methods::Методы расширения"
Метод расширения добавляет к существующему типу «как будто метод экземпляра», не изменяя сам тип и не наследуясь от него; на этом построен весь LINQ.

## Синтаксис {#syntax}

~~~csharp @nocheck
public static class StringExt
{
    public static bool IsBlank(this string? s) => string.IsNullOrWhiteSpace(s);
    public static string Cut(this string s, int n) => s.Length <= n ? s : s[..n];
}
// C# 14: блок extension — методы, свойства, статические члены
public static class Ext
{
    extension(string s) { public bool IsEmpty => s.Length == 0; }
}
~~~

## Семантика {#semantics}

- Метод объявляется в **статическом негенерированном классе верхнего уровня**, а первый параметр помечается `this`.
- Вызов `s.Cut(3)` — синтаксический сахар для `StringExt.Cut(s, 3)`. Метод **не получает доступа** к закрытым членам типа.
- Метод виден, если подключено пространство имён (`using`) с его классом. Это основной способ «включать» расширения.
- **Приоритет:** настоящий метод экземпляра всегда побеждает метод расширения с той же сигнатурой. Расширение никогда не переопределяет и не скрывает члены типа.
- Вызов на `null`-ссылке допустим и не бросает `NullReferenceException` сам по себе: в метод придёт `null`. Этим пользуются для методов вроде `IsBlank` (но аргументы стоит проверять).
- Расширять можно интерфейсы, обобщённые типы, структуры (`this ref`/`this in` для структур) и перечисления.
- **Блоки `extension` (C# 14)** группируют расширения вокруг одного получателя и добавляют **расширяющие свойства** и статические расширяющие члены. Обычные `this`-методы остаются рабочими.
- Не злоупотребляйте: расширения для типов из BCL создают конфликты имён между библиотеками и усложняют чтение.
- Расширения хорошо подходят для «беглых» (fluent) цепочек и для вспомогательных операций над интерфейсами: один метод работает со всеми реализациями. Их удобно покрывать модульными тестами, ведь это обычные статические функции без скрытого состояния.

## Под капотом {#internals}

Метод расширения — обычный статический метод с атрибутом `ExtensionAttribute` на методе и классе. Разрешение имён выполняется компилятором на этапе компиляции: поэтому вызов не виртуальный и не зависит от реального типа объекта.

## Сложность {#complexity}

Не отличается от вызова статического метода: `O(1)` накладных расходов. Цепочки LINQ добавляют итераторы и делегаты — именно они и дают стоимость.

## Версии {#versions}

- C# 3.0 — методы расширения вместе с LINQ.
- C# 7.2 — расширения для `ref`/`in` структур.
- C# 14 — блоки `extension` с расширяющими свойствами и статическими членами.

## Ловушки {#pitfalls}

**Расширение не перекрывает метод экземпляра.**

~~~csharp
var t = new Tool();
Console.WriteLine(t.Name());            // всегда метод экземпляра
Console.WriteLine(ToolExt.Name(t));     // расширение вызывается только явно

class Tool { public string Name() => "экземпляр"; }
static class ToolExt { public static string Name(this Tool t) => "расширение"; }
~~~
~~~console
экземпляр
расширение
~~~

**Не тот `using`.** Если пространство имён не подключено, метод «исчезает» — частая причина ошибки CS1061.

**Расширения не виртуальны:** метод вызывается по статическому типу переменной.

**Конфликт имён** между двумя библиотеками приводит к неоднозначности (CS0121).

## Примеры {#examples}

~~~csharp
Console.WriteLine("hello world".Cut(5));
Console.WriteLine(((string?)null).IsBlank());
Console.WriteLine(new[] { 1, 2, 3, 4 }.Evens().Sum());

string word = "abc";
Console.WriteLine(word.IsEmpty + " " + "".IsEmpty);

static class Ext
{
    public static string Cut(this string s, int n) => s.Length <= n ? s : s[..n];
    public static bool IsBlank(this string? s) => string.IsNullOrWhiteSpace(s);
    public static IEnumerable<int> Evens(this IEnumerable<int> xs) => xs.Where(x => x % 2 == 0);
    extension(string s) { public bool IsEmpty => s.Length == 0; }
}
~~~
~~~console
hello
True
6
False True
~~~

@@ref id="cl-inheritance" cat="C" title="Наследование: virtual, override, new, sealed" cs="1.0" cx="O(1)" mem="O(1)" tags="наследование inheritance virtual override new sealed override base полиморфизм сокрытие члена скрытие базовый класс" topic="p1-inheritance" related="cl-constructors,cl-abstract-vs-interface,cl-vtable,cl-modifiers" learn="dotnet/csharp/fundamentals/object-oriented/inheritance::Наследование"
Наследование позволяет построить тип на основе другого: производный класс получает члены базового, а `virtual`/`override` дают полиморфизм — вызов метода зависит от реального типа объекта.

## Синтаксис {#syntax}

~~~csharp @nocheck
class Animal { public virtual string Speak() => "..."; }
class Dog : Animal { public override string Speak() => "Гав"; }
class Puppy : Dog { public sealed override string Speak() => "Тяв"; }
class Cat : Animal { public new string Speak() => "Мяу"; }   // скрытие, не переопределение
~~~

## Семантика {#semantics}

- Класс наследует ровно от **одного** базового класса (множественное — только для интерфейсов). Всё наследуется от `object`.
- Закрытые (`private`) члены не доступны наследнику; `protected` — доступны.
- `virtual` разрешает переопределение; `override` его выполняет; `abstract` требует. Сигнатура, доступность и возвращаемый тип (кроме ковариантных возвращаемых типов с C# 9) должны совпадать.
- `sealed override` запрещает дальнейшее переопределение; `sealed class` — наследование вообще.
- `new` **скрывает** унаследованный член: вызов зависит от *статического* типа переменной, а не объекта. Это редко нужно, обычно это признак ошибки.
- `base.Member()` вызывает версию базового класса, в том числе из переопределённого метода.
- Конструкторы не наследуются; производный обязан вызвать конструктор базового ([конструкторы](#/ref/c/cl-constructors)).
- Приведение вверх (`Animal a = dog`) всегда безопасно; вниз требует `as`/`is` или явного приведения.
- Приоритет композиции над наследованием: наследование фиксирует связь «является», нарушение принципа подстановки Лисков ломает код.
- Защищённые (`protected`) члены образуют контракт для наследников: изменение их поведения так же ломает потомков, как изменение публичного API. Поэтому поля лучше делать закрытыми, а наследникам предлагать защищённые методы или свойства.
- Пользуйтесь `sealed` по умолчанию для классов, не рассчитанных на наследование: это упрощает рассуждения о коде и помогает JIT-оптимизатору.

## Под капотом {#internals}

У каждого типа есть таблица виртуальных методов; вызов `virtual` метода идёт через неё, `new`-метод вызывается статически по типу переменной ([vtable](#/ref/c/cl-vtable)). Ковариантные возвращаемые типы реализуются компилятором через мостовые методы.

## Сложность {#complexity}

Виртуальный вызов — один дополнительный косвенный переход (~1 нс); JIT может девиртуализировать вызов, если тип известен точно или класс `sealed`.

## Версии {#versions}

- C# 1.0 — `virtual`, `override`, `new`, `sealed`.
- C# 9 — ковариантные возвращаемые типы для переопределений.
- C# 8 — реализации интерфейсов по умолчанию как альтернатива наследованию реализации.

## Ловушки {#pitfalls}

**`new` вместо `override` ломает полиморфизм.**

~~~csharp
Animal a = new Dog();
Animal b = new Cat();
Console.WriteLine(a.Speak());      // Гав  — override
Console.WriteLine(b.Speak());      // ... — new: вызван метод базового типа!
Console.WriteLine(((Cat)b).Speak());

class Animal { public virtual string Speak() => "..."; }
class Dog : Animal { public override string Speak() => "Гав"; }
class Cat : Animal { public new string Speak() => "Мяу"; }
~~~
~~~console
Гав
...
Мяу
~~~

**Вызов виртуального метода в конструкторе** запускает переопределение до инициализации наследника.

**Глубокие иерархии** трудно менять: избегайте более 2–3 уровней.

**Забыли `virtual`:** без него переопределить нельзя, а `new` лишь скроет.

## Примеры {#examples}

~~~csharp
Shape[] shapes = { new Circle(1), new Rect(2, 3) };
foreach (var s in shapes) Console.WriteLine($"{s.Name}: {s.Area():F2}");

abstract class Shape
{
    public virtual string Name => GetType().Name;
    public abstract double Area();
}
class Circle(double r) : Shape { public override double Area() => Math.PI * r * r; }
class Rect(double w, double h) : Shape
{
    public override string Name => "Прямоугольник " + base.Name;
    public override double Area() => w * h;
}
~~~
~~~console
Circle: 3.14
Прямоугольник Rect: 6.00
~~~

@@ref id="cl-abstract-vs-interface" cat="C" title="Абстрактный класс или интерфейс" cs="1.0" cx="O(1)" mem="O(1)" tags="abstract class interface интерфейс абстрактный класс default interface method реализация по умолчанию static abstract различия выбор" topic="p1-interfaces,p1-inheritance" related="cl-inheritance,cl-explicit-interface,cl-vtable,ty-generics" learn="dotnet/csharp/language-reference/keywords/interface::interface"
Абстрактный класс — частично реализованная база с состоянием и конструктором; интерфейс — контракт без состояния, который тип может реализовать в любом количестве.

## Синтаксис {#syntax}

~~~csharp @nocheck
interface IShape { double Area(); string Name => "фигура"; }     // DIM (C# 8)
interface IParse<T> { static abstract T Parse(string s); }       // C# 11
abstract class Repo { protected Repo(string cs) { } public abstract void Save(); public void Log() { } }
class Sq : Repo, IShape, IComparable<Sq> { }
~~~

## Семантика {#semantics}

- **Абстрактный класс:** может иметь поля, конструкторы, реализованные и абстрактные члены любого доступа; допускает только одиночное наследование; нельзя создать экземпляр напрямую.
- **Интерфейс:** описывает контракт; нет полей экземпляра; члены публичны по умолчанию; тип может реализовать сколько угодно интерфейсов, включая структуры.
- С C# 8 интерфейс может содержать **реализацию по умолчанию**: добавление члена не ломает существующих реализаторов. Но доступ к такому члену — только через переменную типа интерфейса.
- С C# 11 интерфейсы содержат `static abstract` члены — основа обобщённой математики (`INumber<T>`).
- **Выбор:** интерфейс — если нужен контракт для разнородных типов, подмена в тестах, внедрение зависимостей. Абстрактный класс — если у типов общая реализация и состояние (шаблонный метод).
- Интерфейс можно расширять другим интерфейсом; класс — реализовывать оба.
- Сочетание обычно лучшее: интерфейс для внешнего контракта, абстрактный класс — для повторного использования кода.
- Добавлять члены в опубликованный интерфейс опасно: без DIM все реализации сломаются.
- Практическое правило: начинайте с интерфейса, когда нужны подмена и тестируемость; добавляйте абстрактный базовый класс, когда несколько реализаций действительно делят код. Не наследуйте ради повторного использования, если можно использовать композицию.
- Интерфейсы можно внедрять через контейнер зависимостей, поэтому в слоях приложения именно они чаще образуют границы между компонентами.

## Под капотом {#internals}

Вызовы через интерфейс используют таблицу интерфейсных вызовов (кэшируемую в местах вызова), что немного дороже виртуального вызова класса ([диспетчеризация](#/ref/c/cl-vtable)). Для структур вызов через интерфейс вызывает упаковку.

## Сложность {#complexity}

Вызов — `O(1)`; интерфейсный вызов на 1–2 нс медленнее виртуального, но JIT часто девиртуализирует через PGO.

## Версии {#versions}

- C# 1.0 — интерфейсы и абстрактные классы.
- C# 8 — реализации по умолчанию, `static` члены в интерфейсах.
- C# 11 — `static abstract` и `static virtual`.

## Ловушки {#pitfalls}

**Член с реализацией по умолчанию недоступен через класс.**

~~~csharp
var c = new Impl();
// Console.WriteLine(c.Hello());      // ❌ CS1061: члена нет у класса
IGreeter g = c;
Console.WriteLine(g.Hello());         // ✅ через интерфейс

interface IGreeter { string Hello() => "привет по умолчанию"; }
class Impl : IGreeter { }
~~~
~~~console
привет по умолчанию
~~~

**Интерфейс на каждый класс** без второй реализации — лишний уровень абстракции.

**Структура через интерфейс упаковывается** — в горячем коде используйте обобщения с ограничением.

**Разрастание интерфейса:** большие контракты нарушают принцип разделения интерфейсов.

## Примеры {#examples}

~~~csharp
IPlugin[] list = { new Echo(), new Upper() };
foreach (var p in list) Console.WriteLine(p.Run("abc"));

interface IPlugin { string Id => GetType().Name; string Run(string s); }
abstract class Base : IPlugin
{
    public string Run(string s) => $"{((IPlugin)this).Id}: {Do(s)}";
    protected abstract string Do(string s);
}
class Echo : Base { protected override string Do(string s) => s; }
class Upper : Base { protected override string Do(string s) => s.ToUpper(); }
~~~
~~~console
Echo: abc
Upper: ABC
~~~

@@ref id="cl-explicit-interface" cat="C" title="Явная реализация интерфейса" cs="1.0" cx="O(1)" mem="O(1)" tags="explicit interface implementation явная реализация интерфейса конфликт имён IEnumerable скрытие члена приведение" topic="p1-interfaces" related="cl-abstract-vs-interface,cl-vtable,cl-properties" learn="dotnet/csharp/programming-guide/interfaces/explicit-interface-implementation::Явная реализация интерфейса"
Явная реализация объявляет член как `IИнтерфейс.Член`: он доступен только через переменную типа интерфейса и не попадает в публичный API класса.

## Синтаксис {#syntax}

~~~csharp @nocheck
class Box : IDisposable, IComparable<Box>
{
    void IDisposable.Dispose() { }                  // без модификатора доступа
    int IComparable<Box>.CompareTo(Box? o) => 0;
}
~~~

## Семантика {#semantics}

- Явный член не имеет модификатора доступа и не может быть `virtual`, `abstract` или `static`; вызвать его можно только приведением к интерфейсу: `((IDisposable)box).Dispose()`.
- Применяется, чтобы **разрешить конфликт имён**, когда два интерфейса требуют метод с одинаковой сигнатурой, но разной семантикой.
- Скрывает «технические» члены от публичного API: например, `ICollection.SyncRoot` или `IEnumerable.GetEnumerator()` неоднородного вида.
- Позволяет реализовать интерфейс, не загрязняя класс: у `List<T>` публичный `Add`, а `ICollection<T>.IsReadOnly` — явный.
- Для структур: приведение к интерфейсу вызывает упаковку.
- Явную реализацию нельзя переопределить; чтобы дать наследникам доступ, делегируйте её защищённому виртуальному методу.
- Если член реализован и неявно, и явно, через интерфейс будет вызван явный.
- IDE подсказывает, какой интерфейс реализован неявно; сигнатуры должны совпадать, иначе CS0535.
- Типичный пример из BCL: `ICollection<T>.IsReadOnly` у массива реализован явно, поэтому у `int[]` нет публичного `IsReadOnly`, но через интерфейс он доступен. Так библиотека скрывает члены, имеющие смысл только в роли интерфейса.
- Явная реализация часто используется для сужения API: класс публично предлагает удобный типизированный метод, а общий интерфейсный метод оставляет явным, чтобы не путать пользователей двумя похожими методами.
- При рефакторинге помните: переименование метода интерфейса автоматически не затронет класс, если реализация явная и IDE не переименовала её; проверяйте компилятором и тестами, что контракт по-прежнему выполняется.

## Под капотом {#internals}

Компилятор создаёт `private` метод с `final virtual newslot` и длинным именем `Namespace.IИнтерфейс.Метод`, связанный с интерфейсным слотом директивой `.override` в метаданных. Через рефлексию такой метод виден как закрытый.

## Сложность {#complexity}

Не добавляет накладных расходов к обычному интерфейсному вызову.

## Версии {#versions}

- C# 1.0 — явная реализация интерфейсов.
- C# 8 — явная реализация членов интерфейса с DIM в производных интерфейсах.

## Ловушки {#pitfalls}

**Член не виден на переменной класса.**

~~~csharp
var b = new Box();
// b.Close();                        // ❌ CS1061
((ICloseable)b).Close();             // ✅
ICloseable c = b;
c.Close();

interface ICloseable { void Close(); }
class Box : ICloseable { void ICloseable.Close() => Console.WriteLine("закрыто"); }
~~~
~~~console
закрыто
закрыто
~~~

**Невозможность вызвать из наследника:** `base.Close()` не работает для явной реализации.

**Упаковка структуры** при каждом приведении к интерфейсу.

**Тесты забывают приведение** и считают, что метода нет.

## Примеры {#examples}

~~~csharp
var m = new Mixed();
Console.WriteLine(m.Name);
Console.WriteLine(((IA)m).Name);
Console.WriteLine(((IB)m).Name);

interface IA { string Name { get; } }
interface IB { string Name { get; } }
class Mixed : IA, IB
{
    public string Name => "общее";
    string IB.Name => "только для IB";
}
~~~
~~~console
общее
общее
только для IB
~~~

@@ref id="cl-nested" cat="C" title="Вложенные типы" cs="1.0" cx="O(1)" mem="O(1)" tags="вложенный тип nested class private nested доступ к закрытым членам внешнего типа Outer Inner строитель enumerator" topic="p1-encapsulation" related="cl-access,cl-kinds,cl-events-delegates" learn="dotnet/csharp/programming-guide/classes-and-structs/nested-types::Вложенные типы"
Вложенный тип объявляется внутри другого типа; он принадлежит внешнему, может быть любым видом типа и видит его закрытые члены.

## Синтаксис {#syntax}

~~~csharp @nocheck
class Outer
{
    private int _x = 1;
    public class Pub { }
    private class Hidden { public int Read(Outer o) => o._x; }   // видит закрытый член
    protected internal struct S { }
    public enum Mode { A, B }
}
var p = new Outer.Pub();            // снаружи — через имя внешнего типа
~~~

## Семантика {#semantics}

- Допустимые модификаторы доступа — любые из шести; по умолчанию вложенный тип `private`.
- Вложенный тип **имеет доступ к закрытым членам** внешнего (получив экземпляр), но не наоборот: внешний не видит `private` членов вложенного.
- Вложенный класс **не привязан к экземпляру** внешнего (в отличие от Java inner-классов): если нужен доступ к экземпляру, передавайте ссылку явно.
- Используется для: деталей реализации, которые не должны попадать в публичный API (итераторы, строители), перечислений, связанных с типом, небольших вспомогательных структур.
- Статические члены внешнего типа доступны вложенному без квалификации.
- Вложенный обобщённый тип наследует параметры внешнего: `Outer<T>.Inner` — разные типы для разных `T`.
- Глубокая вложенность ухудшает читаемость; публичные вложенные типы чаще плохая идея — вынесите их на уровень пространства имён.
- Анализаторы (CA1034) рекомендуют не делать публичные вложенные типы.
- Вложенный тип помогает выразить «этот класс бессмыслен вне владельца»: например, узел связного списка, итератор, пакет настроек. Он не засоряет пространство имён и подчёркивает связь с владельцем. Разработчик, читающий код, сразу видит, что тип не предназначен для самостоятельного использования.
- Если вложенный тип должен быть виден тестам, используйте `internal` вместе с `InternalsVisibleTo`, а не делайте его публичным без необходимости.

## Под капотом {#internals}

В IL вложенный тип — отдельный класс с именем `Outer/Inner` и метаданными о вложенности; закрытые члены доступны через правила CLR для вложенных типов (`family-and-assembly`). Компилятор сам делает вложенными итераторы и замыкания (`<>c__DisplayClass`).

## Сложность {#complexity}

Вложенность — организационный приём; на время выполнения и размер объектов не влияет.

## Версии {#versions}

- C# 1.0 — вложенные типы.
- C# 7.3 — вложенные типы внутри интерфейсов и записей, актуальные для DIM.
- C# 9 — вложенные записи.

## Ловушки {#pitfalls}

**Вложенный класс не знает «своего» внешнего экземпляра.**

~~~csharp
var o = new Outer(5);
var n = new Outer.Peek();
Console.WriteLine(n.Read(o));
// Console.WriteLine(n.Value);      // ❌ у вложенного нет доступа к «своему» Outer

class Outer(int v)
{
    private readonly int _v = v;
    public class Peek { public int Read(Outer o) => o._v; }   // нужна явная ссылка
}
~~~
~~~console
5
~~~

**Публичные вложенные типы** неудобно использовать: `Outer.Inner` повторяется везде.

**Разные `T` — разные вложенные типы** у обобщённого внешнего.

**Прятать слишком много:** тестирование закрытых вложенных типов затруднено.

## Примеры {#examples}

~~~csharp
var list = new Bag(1, 2, 3);
foreach (var x in list) Console.Write(x + " ");
Console.WriteLine();
Console.WriteLine(Bag.Kind.Small);

class Bag(params int[] items)
{
    public enum Kind { Small, Large }
    public Enumerator GetEnumerator() => new(items);
    public struct Enumerator(int[] a)
    {
        private int _i = -1;
        public int Current => a[_i];
        public bool MoveNext() => ++_i < a.Length;
    }
}
~~~
~~~console
1 2 3 
Small
~~~

@@ref id="cl-records" cat="C" title="Записи (record) и with" cs="9.0" cx="O(n)" mem="O(n)" tags="record record struct запись with неизменяемость равенство по значению позиционная запись init Deconstruct ToString" topic="p1-types,p1-encapsulation" related="cl-kinds,cl-properties,op-with,cl-constructors" learn="dotnet/csharp/language-reference/builtin-types/record::Записи"
Запись — тип, у которого компилятор генерирует равенство по значению, `ToString`, `Deconstruct` и копирование с изменением через `with`; идеально подходит для неизменяемых данных.

## Синтаксис {#syntax}

~~~csharp @nocheck
record Point(int X, int Y);                         // позиционная запись (ссылочная)
record struct Vec(double X, double Y);              // запись-структура (C# 10)
readonly record struct Money(decimal Amount, string Cur);
record Person { public required string Name { get; init; } public int Age { get; init; } }
var q = p with { X = 5 };                            // копия с изменением
~~~

## Семантика {#semantics}

- `record` (то же, что `record class`) — ссылочный тип; `record struct` — значимый.
- Позиционный синтаксис создаёт конструктор, `init`-свойства и `Deconstruct`. Для `record struct` без `readonly` свойства изменяемы.
- **Равенство по значению:** `==` и `Equals` сравнивают все поля; `GetHashCode` согласован. Для обычных классов равенство — по ссылке.
- `ToString` печатает `Point { X = 1, Y = 2 }`; для наследников записей учитывается реальный тип.
- Выражение `with` создаёт **неглубокую** копию: вложенные ссылочные объекты не копируются.
- Записи можно наследовать только от записей (классов); `record struct` не наследуются. Равенство учитывает `EqualityContract` — тип должен совпадать.
- Можно переопределить `PrintMembers`, `Equals`, добавить методы и свойства. `sealed` на `ToString` запрещает его переопределение.
- Записи подходят для DTO, сообщений, значений-объектов, результатов; для сущностей с идентичностью и изменяемым состоянием (EF-сущности) подходят хуже.
- Для моделей, которые сохраняются в базе данных через EF Core, записи подходят как значения-объекты (owned types) и проекции для чтения; для отслеживаемых сущностей, меняющихся со временем, лучше обычные классы.
- Записи удобно использовать в сопоставлении с образцом: позиционный шаблон `p is Point(var x, 0)` работает благодаря сгенерированному `Deconstruct`.

## Под капотом {#internals}

Компилятор синтезирует защищённый копирующий конструктор, `Clone`-метод с именем `<Clone>$`, `EqualityContract`, `Equals(T)`, операторы `==`/`!=`, `GetHashCode`, `PrintMembers`, `ToString`. Выражение `with` вызывает `<Clone>$` и затем присваивает `init`-свойства.

## Сложность {#complexity}

Равенство и хеш — `O(числа полей)`; `with` — копирование `O(размер)`. Для больших записей в горячих циклах `record struct` избавляет от аллокаций.

## Версии {#versions}

- C# 9 — `record` и `init`; C# 10 — `record struct`, `sealed ToString`.
- C# 11 — `required` для членов.
- C# 12 — первичные конструкторы для любых типов, не только для записей.

## Ловушки {#pitfalls}

**`with` не копирует вложенные коллекции.**

~~~csharp
var a = new Order(1, new List<string> { "x" });
var b = a with { Id = 2 };
b.Items.Add("y");                          // ❌ изменили общий список
Console.WriteLine(string.Join(",", a.Items));
Console.WriteLine(a == b);
var c = new Order(1, a.Items);
Console.WriteLine(a == c);

record Order(int Id, List<string> Items);
~~~
~~~console
x,y
False
True
~~~

**Равенство по ссылке для коллекций внутри записи:** две записи с разными, но равными по содержимому списками не равны.

**Изменяемые свойства** (`set`) ломают идею неизменяемости и безопасность хешей.

**Запись в качестве ключа словаря** с изменяемым содержимым — классическая ошибка.

## Примеры {#examples}

~~~csharp
var p = new Point(1, 2);
var (x, y) = p;
Console.WriteLine(p);
Console.WriteLine(p with { Y = 9 });
Console.WriteLine(p == new Point(1, 2));
Console.WriteLine(ReferenceEquals(p, new Point(1, 2)));
Console.WriteLine($"{x},{y}");

var m = new Money(5, "RUB");
Console.WriteLine(m);

record Point(int X, int Y);
readonly record struct Money(decimal Amount, string Cur);
~~~
~~~console
Point { X = 1, Y = 2 }
Point { X = 1, Y = 9 }
True
False
1,2
Money { Amount = 5, Cur = RUB }
~~~
