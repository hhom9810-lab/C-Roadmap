@@ref id="cl-attributes" cat="C" title="Атрибуты" cs="1.0" cx="O(1)" mem="O(1)" tags="атрибут attribute Obsolete Conditional CallerMemberName Flags Serializable AttributeUsage рефлексия метаданные GetCustomAttribute" topic="p1-types" related="cl-kinds,cl-methods,cl-modifiers" learn="?dotnet/csharp/advanced-topics/reflection-and-attributes/::Атрибуты"
Атрибут — декларативная метка в метаданных сборки: она ничего не делает сама, но компилятор, среда выполнения, сериализаторы и ваш код могут прочитать её и изменить поведение.

## Синтаксис {#syntax}

~~~csharp @nocheck
[Obsolete("Используйте NewApi", error: false)]
public void OldApi() { }

[Flags] enum Perm { Read = 1, Write = 2 }
[AttributeUsage(AttributeTargets.Method, AllowMultiple = false)]
class AuditAttribute(string who) : Attribute { public string Who => who; }
[return: NotNull] string Get() => "x";
[assembly: InternalsVisibleTo("Tests")]
~~~

## Семантика {#semantics}

- Класс атрибута наследует `System.Attribute`; при применении суффикс `Attribute` можно опустить: `[Audit]`.
- Аргументы атрибута — только константы времени компиляции, `typeof`, массивы таких значений; именованные аргументы задают свойства.
- Цели: сборка, тип, метод, поле, параметр, возвращаемое значение и др.; цель указывается префиксом `[return: …]`, `[field: …]`. `AttributeUsage` ограничивает допустимые цели и повторное применение.
- Атрибуты, которые понимает **компилятор**: `Obsolete`, `Conditional`, `CallerMemberName/FilePath/LineNumber`, `Flags` (для форматирования), `NotNull`/`MaybeNull` для nullable-анализа, `InternalsVisibleTo`, `ModuleInitializer`.
- Атрибуты, которые читают **библиотеки**: `[Required]`, `[JsonPropertyName]`, `[Key]` в EF, `[ApiController]` в ASP.NET Core.
- Свой атрибут читается через рефлексию: `type.GetCustomAttribute<T>()`; атрибуты не выполняются автоматически — код должен прочитать их явно.
- Обобщённые атрибуты (C# 11) позволяют принимать тип через параметр: `[Handler<Order>]`.
- Источниковые генераторы читают атрибуты на этапе компиляции и генерируют код без рефлексии.
- Для собственных атрибутов следуйте соглашению: суффикс `Attribute`, `AttributeUsage` с точным набором целей и запечатанный класс (`sealed`), без логики в конструкторе — так чтение через рефлексию быстрее.
- Атрибуты `[Conditional("DEBUG")]` убирают вызов метода из релизной сборки целиком, включая вычисление аргументов, — удобно для диагностического кода.

## Под капотом {#internals}

Атрибут хранится в таблице `CustomAttribute` метаданных в виде ссылки на конструктор и закодированных аргументов. Экземпляр создаётся только при вызове `GetCustomAttribute*`: каждый вызов создаёт новый объект, поэтому результат стоит кэшировать. Это верно и для атрибутов в горячих путях: прочитайте один раз при старте и сохраните в поле.

## Сложность {#complexity}

Чтение через рефлексию — десятки-сотни наносекунд на атрибут; кэшируйте результат. Сами атрибуты на производительность выполняемого кода не влияют.

## Версии {#versions}

- C# 1.0 — атрибуты; C# 5 — `CallerMemberName` и родственные.
- C# 8 — атрибуты nullable-анализа.
- C# 11 — обобщённые атрибуты, `required`.

## Ловушки {#pitfalls}

**Атрибут сам по себе ничего не делает.**

~~~csharp
using System.Reflection;

var m = typeof(Svc).GetMethod("Run")!;
var a = m.GetCustomAttribute<AuditAttribute>();
Console.WriteLine(a is null ? "нет" : "аудит: " + a.Who);
Console.WriteLine(typeof(Svc).GetMethod("Plain")!.GetCustomAttribute<AuditAttribute>() is null);

[AttributeUsage(AttributeTargets.Method)]
class AuditAttribute(string who) : Attribute { public string Who { get; } = who; }
class Svc
{
    [Audit("valera")] public void Run() { }
    public void Plain() { }
}
~~~
~~~console
аудит: valera
True
~~~

**Ожидание «магии»:** без кода, читающего атрибут, он ничего не меняет.

**Рефлексия медленная и ломается при обрезке (trimming)/AOT;** предпочитайте генераторы.

**Не-константные аргументы** вызывают ошибку CS0182.

## Примеры {#examples}

~~~csharp
using System.Runtime.CompilerServices;

Svc.Start();
Console.WriteLine(Perm.Read | Perm.Write);

class Svc
{
    public static void Start() => Log("старт");
    static void Log(string msg, [CallerMemberName] string who = "") => Console.WriteLine($"{who}: {msg}");
}

[Flags] enum Perm { None = 0, Read = 1, Write = 2 }
~~~
~~~console
Start: старт
Read, Write
~~~

@@ref id="cl-anonymous" cat="C" title="Анонимные типы" cs="3.0" cx="O(1)" mem="O(1)" tags="анонимный тип anonymous type new { } var LINQ проекция Select неизменяемый ToString with" topic="p2-linq" related="ty-tuples,cl-records,cl-initializers" learn="dotnet/csharp/fundamentals/types/anonymous-types::Анонимные типы"
Анонимный тип — безымянный неизменяемый класс, который компилятор создаёт по набору свойств в выражении `new { ... }`; обычно используется для промежуточных результатов LINQ-запросов.

## Синтаксис {#syntax}

~~~csharp @nocheck
var p = new { Name = "Ann", Age = 30 };
var q = new { p.Name, Year = 2026 };           // имя выводится из выражения
var rows = list.Select(x => new { x.Id, Total = x.Price * x.Qty });
var copy = p with { Age = 31 };                // with работает (C# 10)
~~~

## Семантика {#semantics}

- Тип безымянный: объявить переменную можно только через `var` (или `object`/`dynamic`); передать в метод с точным типом нельзя.
- Свойства **только для чтения**; тип запечатан (`sealed`) и наследуется от `object`.
- Два выражения с одинаковыми именами, типами и порядком свойств в одной сборке дают **один и тот же** тип.
- Компилятор генерирует `Equals`, `GetHashCode` (равенство по значению) и `ToString` (`{ Name = Ann, Age = 30 }`).
- Выводимые имена свойств берутся из простых выражений (`p.Name` → `Name`).
- Поля нельзя использовать как члены с методами: добавить методы или интерфейсы анонимному типу невозможно.
- Выход за пределы метода: возвращать анонимный тип неудобно; для этого лучше кортеж, запись или именованный класс.
- В LINQ анонимные типы хороши для группировки и сортировки по нескольким ключам: `group x by new { x.A, x.B }`.
- Если данные нужно передать между методами или вернуть из метода, заведите запись (`record`) или кортеж: у них есть имя или хотя бы понятная форма, а анонимный тип остаётся локальной деталью запроса.
- В сочетании с EF Core анонимная проекция `Select(x => new { x.Id, x.Name })` читает из базы только нужные столбцы, поэтому это и удобный, и эффективный приём.

## Под капотом {#internals}

Компилятор создаёт обобщённый внутренний класс `<>f__AnonymousType0<T1, T2>` с полями только для чтения; одинаковые «формы» разделяют одно определение, а типы свойств подставляются как аргументы.

## Сложность {#complexity}

Один объект в куче на экземпляр (класс, не структура). Для горячих циклов кортеж-структура `(int Id, decimal Total)` не создаёт аллокаций.

## Версии {#versions}

- C# 3.0 — анонимные типы вместе с LINQ.
- C# 7.0 — кортежи как альтернатива без аллокаций.
- C# 10 — выражение `with` для анонимных типов.

## Ловушки {#pitfalls}

**Свойства нельзя изменить.**

~~~csharp
var p = new { Name = "Ann", Age = 30 };
// p.Age = 31;                            // ❌ CS0200: только чтение
var older = p with { Age = 31 };          // ✅ копия
Console.WriteLine(p);
Console.WriteLine(older);
Console.WriteLine(p.Equals(new { Name = "Ann", Age = 30 }));
~~~
~~~console
{ Name = Ann, Age = 30 }
{ Name = Ann, Age = 31 }
True
~~~

**Возвращаемое значение метода:** вызывающий не сможет обратиться к свойствам без `dynamic` (хрупко).

**Разный порядок свойств** — это уже другой тип.

**Захват в долгоживущих коллекциях** удерживает объекты-источники.

## Примеры {#examples}

~~~csharp
var people = new[] { ("Ann", 30), ("Bob", 25), ("Cid", 30) };
var q = people.Select(t => new { Name = t.Item1, Age = t.Item2 })
              .GroupBy(x => x.Age)
              .Select(g => new { Age = g.Key, Count = g.Count() })
              .OrderBy(x => x.Age);
foreach (var r in q) Console.WriteLine(r);
~~~
~~~console
{ Age = 25, Count = 1 }
{ Age = 30, Count = 2 }
~~~

@@ref id="cl-initializers" cat="C" title="Инициализаторы объектов и коллекций" cs="3.0" cx="O(n)" mem="O(n)" tags="инициализатор объекта object initializer collection initializer выражение коллекции [1,2,3] spread .. required init Add IEnumerable" topic="p1-types,p2-list" related="cl-properties,cl-constructors,op-new,ty-arrays" learn="dotnet/csharp/programming-guide/classes-and-structs/object-and-collection-initializers::Инициализаторы объектов и коллекций"
Инициализатор задаёт свойства сразу после создания объекта (`new C { A = 1 }`), а выражение коллекции `[1, 2, 3]` создаёт коллекцию любого поддерживаемого типа короткой записью.

## Синтаксис {#syntax}

~~~csharp @nocheck
var p = new Person { Name = "Ann", Age = 30 };          // инициализатор объекта
var d = new Dictionary<string, int> { ["a"] = 1, ["b"] = 2 };
var l = new List<int> { 1, 2, 3 };                      // инициализатор коллекции
int[] a = [1, 2, 3];   List<int> b = [..a, 4];          // выражения коллекций (C# 12)
Span<int> s = [1, 2];
~~~

## Семантика {#semantics}

- Инициализатор объекта вызывает конструктор, затем присваивает свойства и поля **в порядке записи**. Применять можно к доступным (в том числе `init`) членам.
- Для `required`-членов (C# 11) инициализатор обязателен: компилятор не позволит пропустить.
- Инициализатор коллекции вызывает метод `Add` для каждого элемента; тип должен реализовывать `IEnumerable` и иметь подходящий `Add`. Для словарей — `Add(key, value)` или индексатор `[k] = v`.
- Вложенные инициализаторы: `new A { B = { X = 1 } }` изменяют уже созданный вложенный объект, а не создают новый.
- **Выражение коллекции** (C# 12) работает с массивами, `List<T>`, `Span<T>`, `ImmutableArray<T>` и др.; оператор `..` (spread) вставляет элементы другой последовательности.
- Целевой тип определяет создаваемую коллекцию: `IEnumerable<int> x = [1, 2]` создаст подходящую реализацию.
- Для пустой коллекции `[]` не всегда создаётся новый объект — это допустимая оптимизация.
- Исключение в инициализаторе возникает после создания объекта; объект при этом не сохраняется.
- Выбирайте между конструктором и инициализатором: обязательные данные передавайте через конструктор или `required`, а необязательные настройки удобно выставлять инициализатором. Так объект не окажется наполовину готовым.
- Выражения коллекций позволяют заменить `Array.Empty<T>()` и `new List<T>()` одним синтаксисом `[]`, а компилятор подберёт наиболее эффективную реализацию для целевого типа.

## Под капотом {#internals}

Инициализатор объекта разворачивается в последовательность присваиваний к временной переменной, которая затем присваивается целевой. Инициализатор коллекции — вызовы `Add`. Выражения коллекций для массивов и `Span` компилируются в прямое заполнение, часто через `RuntimeHelpers.CreateSpan` (без лишних копий).

## Сложность {#complexity}

`O(n)` по числу элементов; для `List<T>` с известным размером полезна ёмкость: выражения коллекций сами задают точный размер.

## Версии {#versions}

- C# 3.0 — инициализаторы объектов и коллекций.
- C# 6 — инициализаторы индексаторов `[k] = v`; C# 9 — `init`.
- C# 12 — выражения коллекций и spread; C# 13 — `^` в инициализаторах.

## Ловушки {#pitfalls}

**Вложенный инициализатор изменяет, а не создаёт.**

~~~csharp
var a = new Holder { Inner = { X = 5 } };
Console.WriteLine(a.Inner.X);
try { var b = new Holder2 { Inner = { X = 5 } }; }     // ❌ Inner = null
catch (NullReferenceException) { Console.WriteLine("NullReferenceException"); }

class Inner { public int X { get; set; } }
class Holder { public Inner Inner { get; } = new(); }
class Holder2 { public Inner Inner { get; set; } = null!; }
~~~
~~~console
5
NullReferenceException
~~~

**Свойство без `set`** в инициализаторе не присваивается (CS0200).

**`Add` с побочными эффектами** вызывается при каждом элементе.

**Spread в горячем коде** создаёт временные коллекции.

## Примеры {#examples}

~~~csharp
int[] a = [1, 2, 3];
List<int> b = [0, ..a, 4];
Console.WriteLine(string.Join(",", b));

var cfg = new Config { Host = "localhost", Ports = { 80, 443 } };
Console.WriteLine($"{cfg.Host} {string.Join("/", cfg.Ports)}");

var map = new Dictionary<string, int> { ["x"] = 1, ["y"] = 2 };
Console.WriteLine(map.Count);

class Config { public required string Host { get; init; } public List<int> Ports { get; } = new(); }
~~~
~~~console
0,1,2,3,4
localhost 80/443
2
~~~

@@ref id="cl-layout" cat="C" title="Раскладка объекта в памяти" cs="1.0" cx="O(1)" mem="O(размер)" tags="layout раскладка памяти объект заголовок указатель на таблицу методов выравнивание padding StructLayout Unsafe.SizeOf размер объекта поля порядок упаковка" topic="p1-types" related="ty-struct,ty-boxing,cl-vtable,cl-fields" learn="dotnet/standard/garbage-collection/fundamentals::Основы сборки мусора"
Экземпляр класса в куче состоит из служебного заголовка, указателя на описание типа и полей; размер структуры определяют типы полей и выравнивание.

## Синтаксис {#syntax}

~~~csharp @nocheck
[StructLayout(LayoutKind.Sequential)]  struct A { byte b; int i; byte c; }
[StructLayout(LayoutKind.Explicit)]    struct U { [FieldOffset(0)] int i; [FieldOffset(0)] float f; }
[StructLayout(LayoutKind.Sequential, Pack = 1)] struct P { byte b; int i; }
int n = Unsafe.SizeOf<A>();
~~~

## Семантика {#semantics}

- **Объект класса** в 64-битном процессе: заголовок (8 байт), указатель на таблицу методов (8 байт), затем поля; минимум — 24 байта на объект (требует проверки для конкретной версии среды выполнения).
- **Структуры** лежат на стеке, в полях объектов или массивах без заголовка; размер = сумма полей плюс выравнивание.
- Поля выравниваются по своему размеру: `int` — по 4 байтам. Порядок в `struct` по умолчанию `Sequential`, поэтому `byte, int, byte` занимает 12 байт, а `int, byte, byte` — 8.
- Для **классов** среда выполнения вправе переупорядочить поля (`LayoutKind.Auto`): ссылки группируются вместе для сборщика мусора.
- `LayoutKind.Explicit` + `FieldOffset` дают объединения (union) для взаимодействия с неуправляемым кодом.
- `Pack` задаёт максимальное выравнивание полей; влияет на скорость доступа и совместимость.
- Массив значимых типов — непрерывный блок; массив ссылок — блок ссылок на объекты в куче, поэтому обход структур быстрее благодаря локальности кэша.
- Упаковка (`boxing`) создаёт объект-обёртку с заголовком и указателем на тип.
- Сборщик мусора перемещает объекты (компактирование); адреса нестабильны, поэтому для `unsafe` нужны `fixed` или закрепление.

## Под капотом {#internals}

Первое слово объекта — указатель на `MethodTable`: описание типа с таблицей виртуальных методов, размером и информацией для GC. Перед ним находится слово заголовка (блокировки `lock`, хеш-код, служебные флаги). Поля идут за указателем.

## Сложность {#complexity}

Размер объекта влияет на давление на память и кэш процессора: компактные структуры в массивах дают лучшую локальность. Создание — `O(размер)` (обнуление памяти).

## Версии {#versions}

- C# 1.0 — `StructLayout`, `FieldOffset`.
- .NET 5+ — `Unsafe.SizeOf`; .NET 8 — `InlineArray` для встроенных массивов в структурах.

## Ловушки {#pitfalls}

**Порядок полей меняет размер структуры.**

~~~csharp
using System.Runtime.CompilerServices;

Console.WriteLine(Unsafe.SizeOf<Bad>());
Console.WriteLine(Unsafe.SizeOf<Good>());
Console.WriteLine(Unsafe.SizeOf<Pair>());

struct Bad { public byte A; public int B; public byte C; }
struct Good { public int B; public byte A; public byte C; }
struct Pair { public long X; public long Y; }
~~~
~~~console
12
8
16
~~~

**Ожидание конкретного размера объекта:** он зависит от платформы и версии среды выполнения.

**Большие структуры копируются** при каждой передаче по значению; используйте `in`/`ref`.

**`LayoutKind.Explicit` с ссылками** приводит к ошибкам: пересекать ссылочные поля нельзя.

## Примеры {#examples}

~~~csharp
using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;

Console.WriteLine(Unsafe.SizeOf<Packed>());
var u = new U { I = 1065353216 };
Console.WriteLine(u.F);

[StructLayout(LayoutKind.Sequential, Pack = 1)] struct Packed { public byte B; public int I; }
[StructLayout(LayoutKind.Explicit)] struct U { [FieldOffset(0)] public int I; [FieldOffset(0)] public float F; }
~~~
~~~console
5
1
~~~

@@ref id="cl-vtable" cat="C" title="Виртуальные вызовы и диспетчеризация" cs="1.0" cx="O(1)" mem="O(1)" tags="vtable таблица виртуальных методов диспетчеризация virtual call interface dispatch девиртуализация PGO sealed callvirt" topic="p1-inheritance,p1-interfaces" related="cl-inheritance,cl-abstract-vs-interface,cl-layout,cl-explicit-interface" learn="?dotnet/csharp/fundamentals/object-oriented/polymorphism::Полиморфизм"
Диспетчеризация — выбор конкретной реализации метода во время вызова: для `virtual` через таблицу методов типа, для интерфейсов — через карту интерфейсных вызовов.

## Синтаксис {#syntax}

~~~csharp @nocheck
Animal a = new Dog();
a.Speak();                  // callvirt → слот в таблице виртуальных методов Dog
IShape s = new Circle();
s.Area();                   // интерфейсная диспетчеризация
sealed class Dog : Animal { public override string Speak() => "Гав"; }   // девиртуализация возможна
~~~

## Семантика {#semantics}

- Для обычных (невиртуальных) методов адрес известен при компиляции: вызов прямой и может быть встроен.
- Для `virtual`/`abstract` методов выбор делается по **реальному типу объекта**: C# выдаёт инструкцию `callvirt`, которая берёт адрес из таблицы виртуальных методов.
- `callvirt` используется и для невиртуальных методов экземпляра — он заодно проверяет `null` (отсюда `NullReferenceException`).
- Вызов по интерфейсу находит реализацию в карте интерфейсов типа; среда выполнения кэширует результат в месте вызова (виртуальные заглушки, *virtual stub dispatch*).
- `new`-методы и статические методы выбираются по статическому типу, без таблицы.
- **Девиртуализация:** если JIT знает точный тип (локальный `new`, `sealed`-класс, динамический PGO в .NET 8+), он заменяет виртуальный вызов прямым и может встроить метод.
- Пометка `sealed` на классах и переопределениях — подсказка для оптимизации, а также гарантия дизайна.
- Стоимость диспетчеризации важна лишь в очень горячем коде; сначала измеряйте.
- Структуры не имеют таблицы: вызов интерфейсного метода структуры через обобщённое ограничение (`where T : IFoo`) не упаковывает и вызывается напрямую.

## Под капотом {#internals}

Таблица методов (`MethodTable`) типа содержит слоты виртуальных методов; производный тип копирует слоты базового и заменяет переопределённые. Вызов — загрузка указателя на таблицу из объекта, загрузка адреса из слота, косвенный переход. Интерфейсные вызовы добавляют уровень поиска, заменяемый кэшируемой заглушкой.

## Сложность {#complexity}

Виртуальный вызов — обычно 1–3 нс при предсказанном переходе; интерфейсный — немного дороже. Не встраивается, пока не девиртуализирован.

## Версии {#versions}

- C# 1.0 — виртуальные методы и интерфейсы.
- .NET Core 3.0 — улучшенная девиртуализация; .NET 8 — динамический PGO, охраняемая девиртуализация по умолчанию.
- C# 11 — `static abstract` не требует диспетчеризации во время выполнения.

## Ловушки {#pitfalls}

**Статический тип решает для `new`, динамический — для `override`.**

~~~csharp
A x = new B();
Console.WriteLine(x.Virt());     // B-override
Console.WriteLine(x.Hide());     // A-hide (скрытие)
Console.WriteLine(((B)x).Hide()); // B-hide

class A { public virtual string Virt() => "A-virt"; public string Hide() => "A-hide"; }
class B : A { public override string Virt() => "B-override"; public new string Hide() => "B-hide"; }
~~~
~~~console
B-override
A-hide
B-hide
~~~

**Преждевременная оптимизация:** замена полиморфизма на `switch` ради наносекунды ухудшает дизайн.

**Структура через интерфейсную переменную** упаковывается.

**Предположение, что `sealed` ускоряет всегда:** выигрыш зависит от JIT и точки вызова.

## Примеры {#examples}

~~~csharp
IShape[] shapes = { new Circle(2), new Square(3) };
double total = 0;
foreach (var s in shapes) total += s.Area();
Console.WriteLine($"{total:F2}");

Animal a = new Dog();
Console.WriteLine(a.Speak());
Console.WriteLine(a.GetType().Name);

interface IShape { double Area(); }
record Circle(double R) : IShape { public double Area() => Math.PI * R * R; }
record Square(double S) : IShape { public double Area() => S * S; }
abstract class Animal { public abstract string Speak(); }
sealed class Dog : Animal { public override string Speak() => "Гав"; }
~~~
~~~console
21.57
Гав
Dog
~~~
