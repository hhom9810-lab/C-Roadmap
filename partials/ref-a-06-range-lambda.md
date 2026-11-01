@@ref id="op-range-index" cat="A" title="Индексы и диапазоны (^ и ..)" cs="8.0" cx="O(n)" mem="O(n)" tags="range index ^ .. срез Slice Span substring GetSubArray с конца Index Range spread" topic="p1-types,p1-strings,p2-list" related="op-pattern-list,op-stackalloc,op-new" learn="?dotnet/csharp/language-reference/proposals/csharp-8.0/ranges::Индексы и диапазоны"
Оператор `^n` обозначает позицию `n`-го элемента с конца, а `a..b` задаёт диапазон «от `a` включительно до `b` не включая»; вместе они заменяют арифметику с `Length` и вызовы `Substring`/`Slice`.

## Синтаксис {#syntax}

~~~csharp @nocheck
arr[^1]          // последний элемент
arr[^2]          // предпоследний
arr[1..4]        // элементы 1, 2, 3 (индексы)
arr[..3]         // первые три
arr[2..]         // всё, начиная с индекса 2
arr[^3..]        // последние три
arr[..]          // копия целиком
Index i = ^1;    Range r = 1..^1;   // значения типов System.Index и System.Range
~~~

## Семантика {#semantics}

- `^0` — позиция **за** последним элементом (длина), поэтому `arr[^0]` вызовет исключение, а `arr[^1]` — последний элемент.
- Диапазон `a..b` — полуоткрытый: `a` входит, `b` — нет. Длина среза равна `b - a`.
- Любая граница может быть опущена: `..b`, `a..`, `..`.
- Для **массивов** срез `arr[a..b]` создаёт **копию** (`RuntimeHelpers.GetSubArray`). Для `string` — новую строку (`Substring`). Для `Span<T>`/`ReadOnlySpan<T>` — представление **без копирования**.
- Тип подходит, если у него есть доступное `Length` или `Count`, индексатор по `int` — для `^`; метод `Slice(int, int)` — для диапазона. `List<T>` поддерживает `list[^1]`, но не `list[1..3]` (для этого есть `GetRange`).
- Выход за границы даёт `ArgumentOutOfRangeException` (или `IndexOutOfRangeException` для массивов).
- `Index` и `Range` — обычные структуры; их можно хранить и передавать: `Range last2 = ^2..;`.
- Начиная с C# 12, в коллекционных выражениях доступен spread `..x`: `int[] c = [..a, ..b];` — другая операция, она раскрывает последовательность, а не задаёт диапазон.

## Под капотом {#internals}

`arr[^k]` компилируется в `arr[arr.Length - k]` без создания `Index`, а `arr[a..b]` для массива — в вызов `GetSubArray(arr, Range)`. Для `Span<T>` — вызов `Slice(start, length)` с вычисленными границами. Переменные типа `Index` и `Range` — структуры по 4 и 8 байт; в куче они не размещаются.

## Сложность {#complexity}

`^k` — `O(1)`. Срез массива и строки — `O(длина среза)` по времени и памяти (копирование); срез `Span<T>` — `O(1)`.

## Версии {#versions}

- C# 8 / .NET Core 3.0 — `Index`, `Range`, `^`, `..`.
- .NET Standard 2.1 — типы `Index` и `Range`; для более старых платформ нужны собственные определения.
- C# 12 — spread `..` в коллекционных выражениях; C# 13 — `^` внутри инициализаторов объектов (`new C { Items = { [^1] = x } }`).

## Ловушки {#pitfalls}

**Срез массива — это копия.**

~~~csharp
int[] a = { 1, 2, 3, 4, 5 };
int[] part = a[1..4];
part[0] = 99;                                // ❌ a не изменился
Console.WriteLine(string.Join(",", a));      // 1,2,3,4,5

Span<int> view = a.AsSpan()[1..4];
view[0] = 99;                                // ✅ меняется исходный массив
Console.WriteLine(string.Join(",", a));      // 1,99,3,4,5
~~~
~~~console
1,2,3,4,5
1,99,3,4,5
~~~

**`^0`.** Это длина, а не последний элемент.

**Путаница включительности.** Правая граница не входит: `s[0..3]` — три символа.

**Срез в горячем цикле.** `arr[1..]` на каждой итерации копирует остаток массива — получится `O(n²)`; используйте `Span<T>` или индексы.

## Примеры {#examples}

~~~csharp
string s = "abcdefgh";
Console.WriteLine(s[^1]);        // h
Console.WriteLine(s[2..5]);      // cde
Console.WriteLine(s[..3]);       // abc
Console.WriteLine(s[^3..]);      // fgh
Console.WriteLine(s[1..^1]);     // bcdefg

var list = new List<int> { 10, 20, 30 };
Console.WriteLine(list[^1]);     // 30

Range r = 2..4;
var (offset, length) = r.GetOffsetAndLength(8);
Console.WriteLine($"{offset} {length}");   // 2 2
int[] spread = [..new[] { 1, 2 }, ..new[] { 3 }];
Console.WriteLine(spread.Length);          // 3
~~~
~~~console
h
cde
abc
fgh
bcdefg
30
2 2
3
~~~

@@ref id="op-lambda" cat="A" title="Лямбда-выражения (=>)" cs="3.0" cx="O(1)" mem="O(1)" danger="1" tags="лямбда lambda => делегат Func Action замыкание closure static lambda захват переменной цикл foreach" topic="p2-linq,p1-methods" related="op-assignment,op-eval-order,op-await" learn="dotnet/csharp/language-reference/operators/lambda-expressions::Лямбда-выражения"
Лямбда-выражение `(параметры) => тело` создаёт анонимную функцию, которая превращается в делегат или дерево выражений и может захватывать переменные окружающего метода.

## Синтаксис {#syntax}

~~~csharp @nocheck
Func<int, int> sq = x => x * x;                 // выражение
Func<int, int, int> add = (a, b) => a + b;
Action log = () => Console.WriteLine("hi");
Func<int, int> f = x => { return x + 1; };      // блок
var parse = (string s) => int.Parse(s);         // C# 10: естественный тип
Func<int, int> g = static x => x * 2;           // static: без захвата (C# 9)
(int a, int b = 5) => a + b;                    // параметры по умолчанию (C# 12)
~~~

## Семантика {#semantics}

- Лямбда сама по себе не имеет типа: она преобразуется в совместимый делегат (`Func<>`, `Action<>`, `Predicate<>` и др.) или в `Expression<Func<...>>`. С C# 10 при явных типах параметров у неё есть *естественный тип* (`Func<>`/`Action<>`), и можно писать `var`.
- Тело-выражение возвращает значение выражения; тело-блок требует `return`.
- **Замыкание.** Лямбда захватывает *переменные*, а не их значения. Если переменная меняется после создания лямбды, лямбда увидит новое значение.
- Захваченные локальные переменные переносятся в сгенерированный класс (замыкание) в куче; параметры и `ref`-локальные захватывать нельзя.
- `static`-лямбда не может захватывать ничего, кроме констант и статических членов — гарантия отсутствия аллокаций.
- Параметры можно отбрасывать: `(_, _) => 0` (C# 9).
- `async`-лямбда возвращает `Task`; у `void`-делегата (`Action`) получится `async void` — опасно.
- Лямбда внутри `Expression<>` компилируется в дерево выражений (так работает EF Core и LINQ to SQL), и там допустимы не все конструкции.

## Под капотом {#internals}

Лямбда без захвата кэшируется в статическом поле синтезированного класса: делегат создаётся один раз. Лямбда с захватом порождает объект замыкания (display class) и новый делегат при каждом выполнении выражения. Все лямбды одного метода, захватывающие одни и те же переменные, делят один объект замыкания. Для `foreach` (с C# 5) на каждой итерации создаётся своя копия переменной цикла, для `for` — одна общая.

## Сложность {#complexity}

Создание делегата с захватом — аллокация (десятки байт); вызов делегата — немного дороже вызова обычного метода и не встраивается JIT. В горячих участках используйте `static`-лямбды или обычные методы.

## Версии {#versions}

- C# 2.0 — анонимные методы `delegate { }`; C# 3.0 — лямбды `=>`.
- C# 5 — переменная `foreach` создаётся на каждой итерации.
- C# 9 — `static` лямбды, discard-параметры; C# 10 — естественный тип, атрибуты, явный тип возврата; C# 12 — параметры по умолчанию и `params` в лямбдах.

## Ловушки {#pitfalls}

**Захват изменяющейся переменной цикла `for`.**

~~~csharp
var actions = new List<Action>();
for (int i = 0; i < 3; i++)
    actions.Add(() => Console.Write(i + " "));   // ❌ все видят одну переменную i
foreach (var a in actions) a();
Console.WriteLine();

actions.Clear();
for (int i = 0; i < 3; i++)
{
    int copy = i;                                // ✅ копия на каждой итерации
    actions.Add(() => Console.Write(copy + " "));
}
foreach (var a in actions) a();
Console.WriteLine();
~~~
~~~console
3 3 3 
0 1 2
~~~

**`async` лямбда в `Action`** — `async void`, исключение уйдёт в контекст синхронизации и может уронить процесс; используйте `Func<Task>`.

**Скрытые аллокации** в горячем пути из-за захвата `this` или локальных переменных.

**Подписка и отписка.** Лямбда не равна «такой же» лямбде: `-=` с новой лямбдой не отпишет прежнюю.

## Примеры {#examples}

~~~csharp
var nums = new[] { 5, 3, 8, 1 };
Console.WriteLine(string.Join(",", nums.Where(n => n > 2).OrderBy(n => n)));   // 3,5,8

int factor = 10;
Func<int, int> mul = x => x * factor;
Console.WriteLine(mul(2));    // 20
factor = 100;
Console.WriteLine(mul(2));    // 200: лямбда видит новое значение

Func<int, int, int> max = static (a, b) => a > b ? a : b;
Console.WriteLine(max(3, 9));  // 9

var square = (int x) => x * x;   // естественный тип Func<int,int>
Console.WriteLine(square(7));    // 49
~~~
~~~console
3,5,8
20
200
9
49
~~~

@@ref id="op-typeof-sizeof" cat="A" title="typeof и sizeof" cs="1.0" cx="O(1)" mem="O(1)" tags="typeof sizeof Type GetType размер типа Marshal.SizeOf Unsafe.SizeOf generic typeof(List<>) unsafe" topic="p1-types" related="op-nameof,op-default,op-is-as,op-pointers" learn="dotnet/csharp/language-reference/operators/type-testing-and-cast::Оператор typeof"
`typeof(T)` возвращает объект `System.Type` для известного на этапе компиляции типа, а `sizeof(T)` — размер типа в байтах для встроенных типов и неуправляемых структур.

## Синтаксис {#syntax}

~~~csharp @nocheck
Type t = typeof(string);
Type open = typeof(List<>);                 // открытый обобщённый тип
Type t2 = typeof(List<int>);
int n = sizeof(int);                        // 4 — константа
int s = sizeof(MyStruct);                   // только в unsafe-контексте
var type = obj.GetType();                   // тип объекта в рантайме
~~~

## Семантика {#semantics}

- `typeof` принимает **имя типа**, а не значение. Для типа значения во время выполнения используйте `obj.GetType()`.
- `typeof(T)` внутри обобщённого метода возвращает `Type` для фактического аргумента типа.
- `typeof(List<>)` — открытый обобщённый тип; нужен для рефлексии и контейнеров DI. `typeof(Dictionary<,>)` — для двух параметров.
- Объект `Type` для одного типа — один и тот же экземпляр, поэтому `typeof(string) == typeof(string)` — сравнение ссылок.
- `x.GetType() == typeof(Dog)` проверяет **точный** тип, а `x is Dog` — совместимость, включая производные.
- `sizeof` для встроенных типов (`int`, `long`, `double`, `char`, `bool`…) — константа времени компиляции и **не требует `unsafe`**. Для `enum` он тоже константа. Для пользовательских структур нужен `unsafe`-контекст (ошибка CS0233 иначе), и тип должен быть неуправляемым.
- `sizeof(bool)` — 1, `sizeof(char)` — 2, `sizeof(decimal)` — 16.
- `Type` — точка входа в рефлексию: через него получают свойства, методы и атрибуты, создают экземпляры (`Activator.CreateInstance`).
- Фактический размер управляемого объекта в куче `sizeof` не показывает: у классов есть заголовок и выравнивание.

## Под капотом {#internals}

`typeof` компилируется в `ldtoken` + вызов `Type.GetTypeFromHandle`; JIT превращает это в константу. Результат `sizeof` для встроенных типов подставляется на этапе компиляции, для остальных — инструкция IL `sizeof`, которую вычисляет JIT. Для реального размера структуры в безопасном коде используйте `System.Runtime.CompilerServices.Unsafe.SizeOf<T>()`, для маршалинга — `Marshal.SizeOf<T>()` (размеры могут различаться).

## Сложность {#complexity}

`O(1)`. `typeof` дёшев, но методы рефлексии над `Type` (`GetMethods`, `GetProperties`) затратны — кэшируйте результат.

## Версии {#versions}

- C# 1.0 — `typeof`, `sizeof`.
- C# 2.0 — открытые обобщённые типы `typeof(List<>)`.

## Ловушки {#pitfalls}

**Точный тип и совместимость.**

~~~csharp
object d = new Derived();
Console.WriteLine(d.GetType() == typeof(Base));   // ❌ False: точный тип — Derived
Console.WriteLine(d is Base);                     // ✅ True

class Base { }
class Derived : Base { }
~~~
~~~console
False
True
~~~

**Размер в `sizeof` и в памяти.** Для `bool` значение — 1 байт, но в массивах и полях действует выравнивание.

**`typeof` над параметром типа.** `typeof(T)` вычисляется в рантайме, но дёшево; не нужен `new T().GetType()`.

**Путаница `Type` и `typeof`.** `typeof` — оператор, `Type` — класс; у `Type` есть и статический метод `Type.GetType(string)`, который ищет тип по имени в рантайме и может вернуть `null`.

## Примеры {#examples}

~~~csharp
Console.WriteLine(typeof(int));                    // System.Int32
Console.WriteLine(typeof(List<>));                 // System.Collections.Generic.List`1[T]
Console.WriteLine(typeof(Dictionary<string, int>).Name);
Console.WriteLine($"{sizeof(int)} {sizeof(long)} {sizeof(char)} {sizeof(bool)} {sizeof(decimal)}");

object o = 3.5;
Console.WriteLine(o.GetType().Name);               // Double
Console.WriteLine(o.GetType() == typeof(double));  // True
~~~
~~~console
System.Int32
System.Collections.Generic.List`1[T]
Dictionary`2
4 8 2 1 16
Double
True
~~~

@@ref id="op-nameof" cat="A" title="Оператор nameof" cs="6.0" cx="O(1)" mem="O(1)" tags="nameof имя символа рефакторинг INotifyPropertyChanged ArgumentNullException CallerMemberName" topic="p1-exceptions,p1-methods" related="op-typeof-sizeof,op-throw-expression,op-default" learn="dotnet/csharp/language-reference/operators/nameof::Оператор nameof"
`nameof(x)` возвращает имя переменной, типа или члена как строку на этапе компиляции, поэтому сообщения об ошибках и привязки переживают переименование.

## Синтаксис {#syntax}

~~~csharp @nocheck
nameof(userName)             // "userName"
nameof(Person.Name)          // "Name"
nameof(List<int>)            // "List"
nameof(System.Collections)   // "Collections"
nameof(this.Count)           // "Count"
~~~

## Семантика {#semantics}

- Результат — **строковая константа** времени компиляции; код `nameof(...)` во время выполнения не вычисляется.
- Для члена возвращается последний простой идентификатор: `nameof(System.Collections.Generic.List<int>.Count)` — `"Count"`.
- Аргумент может быть переменной, параметром, типом, пространством имён, методом (без скобок), событием.
- Имя возвращается в том виде, как оно записано в коде, без префиксов вроде `@`: `nameof(@class)` — `"class"`.
- Для обобщённых типов без аргументов типа возвращается имя без `` `1 ``: `nameof(List<>)` допустимо с C# 14 — до этого нужно писать `nameof(List<int>)`.
- Через `nameof` можно указывать на параметры из атрибутов метода: `[NotNullIfNotNull(nameof(path))]` (с C# 11 доступны параметры метода внутри атрибутов того же метода).
- Часто используется вместе с `CallerMemberName` для уведомлений об изменении свойств и для имён параметров в `ArgumentException`.
- Внутри интерполированной строки `nameof` удобен для сообщений: `$"{nameof(Id)} должен быть положительным"`.

## Под капотом {#internals}

Компилятор заменяет `nameof(x)` литералом `"x"` ещё на этапе компиляции; в IL остаётся обычный `ldstr`. Поэтому нет и затрат времени выполнения, и рефлексии. Минификаторы и обфускаторы переименуют идентификатор, но строка уже подставлена с исходным именем.

## Сложность {#complexity}

Нулевые затраты времени выполнения: это строковая константа, которая попадает в таблицу литералов сборки и разделяется между всеми использованиями.

## Версии {#versions}

- C# 6.0 — `nameof`.
- C# 11 — `nameof` с параметрами метода внутри атрибутов метода и его параметров.
- C# 14 — `nameof` с неуказанными аргументами открытого обобщённого типа (`nameof(List<>)`).

## Ловушки {#pitfalls}

**Строка вместо `nameof`.**

~~~csharp
static void Save(string path)
{
    if (path is null) throw new ArgumentNullException("pth");          // ❌ опечатка в строке не поймана
}
static void Load(string path)
{
    if (path is null) throw new ArgumentNullException(nameof(path));   // ✅ переименование обновит и текст
}
try { Load(null!); } catch (ArgumentNullException e) { Console.WriteLine(e.ParamName); }
~~~
~~~console
path
~~~

**Не имя из рантайма.** `nameof(obj)` — имя переменной, а не тип объекта: для типа вызовите `obj.GetType().Name`.

**Для перечислений.** `nameof(Color.Red)` — `"Red"`; для значений из данных используйте `Enum.ToString()`.

**Строки из конфигурации.** `nameof` подставляет имя из кода, а не из данных; для имён, пришедших извне, он бесполезен.

**Локализация.** `nameof` не предназначен для текстов, показываемых пользователю: это идентификатор из кода.

## Примеры {#examples}

~~~csharp
int count = 5;
Console.WriteLine(nameof(count));                            // count
Console.WriteLine(nameof(Console.WriteLine));                // WriteLine
Console.WriteLine(nameof(System.Collections.Generic));       // Generic
Console.WriteLine(nameof(List<int>.Count));                  // Count

Console.WriteLine($"{nameof(Order.Id)} и {nameof(Order.Customer)}");

record Order(int Id, string Customer);
~~~
~~~console
count
WriteLine
Generic
Count
Id и Customer
~~~

@@ref id="op-default" cat="A" title="Литерал и оператор default" cs="2.0" cx="O(1)" mem="O(1)" tags="default default(T) default literal нулевое значение generic where T обнуление Nullable" topic="p1-types" related="op-typeof-sizeof,op-null-coalescing,op-new" learn="dotnet/csharp/language-reference/operators/default::Оператор default"
`default(T)` и литерал `default` дают значение типа по умолчанию: `0` для чисел, `false` для `bool`, `null` для ссылочных и nullable-типов и структуру с обнулёнными полями для остальных.

## Синтаксис {#syntax}

~~~csharp @nocheck
int i = default;             // 0 — литерал default (C# 7.1)
var d = default(DateTime);   // 0001-01-01
string? s = default;         // null
T Make<T>() => default!;     // для параметра типа
void M(int x = default) { }  // параметр по умолчанию
~~~

## Семантика {#semantics}

- Значение определяется типом: числа — `0`, `bool` — `false`, `char` — `'\0'`, ссылки и `Nullable<T>` — `null`, `enum` — значение `0` (даже если члена с таким значением нет).
- Для структуры все поля становятся `default` — это то, чем инициализируются элементы нового массива `new T[n]`.
- Литерал `default` выводит тип из контекста; если контекста нет (например, `var x = default;`), это ошибка. Оператор `default(T)` тип указывает явно.
- В обобщённом коде `default(T)` — единственный способ получить «пустое» значение, не зная, значимый тип или ссылочный.
- Для `struct` нет конструктора без параметров по умолчанию (до C# 10), а `default(MyStruct)` минует любой пользовательский конструктор: инварианты, установленные конструктором, не гарантируются.
- `default` в `switch`-метке — это *другое* значение слова: ветка по умолчанию.
- С включённым nullable-анализом `default(string)` — это `null` в типе `string`, компилятор предупредит; пишите `default!` или `string? s`.

## Под капотом {#internals}

Для встроенных типов компилятор подставляет константу (`ldc.i4.0`, `ldnull`), для структур — инструкцию `initobj`, которая обнуляет память. Для параметра типа JIT генерирует код под конкретный аргумент (для значимого типа — обнуление, для ссылочного — `null`). Никаких вызовов конструкторов нет.

## Сложность {#complexity}

`O(1)` для встроенных типов, `O(размер структуры)` для обнуления структуры.

## Версии {#versions}

- C# 2.0 — `default(T)`, нужен для обобщений.
- C# 7.1 — литерал `default`.
- C# 8 — nullable-анализ учитывает `default`; C# 10 — структуры могут иметь явный конструктор без параметров, но `default` его по-прежнему не вызывает.

## Ловушки {#pitfalls}

**`default(MyStruct)` минует конструктор.**

~~~csharp
var ok = new Counter(5);
var bad = default(Counter);
Console.WriteLine(ok.Max);         // 5
Console.WriteLine(bad.Max);        // ❌ 0 — конструктор не вызывался; инвариант Max > 0 нарушен

readonly struct Counter { public int Max { get; } public Counter(int max) => Max = max > 0 ? max : throw new ArgumentOutOfRangeException(nameof(max)); }
~~~
~~~console
5
0
~~~

**`enum` с нулём без имени.** `default(Level)` может не соответствовать ни одному члену; задавайте `None = 0` или `Unknown = 0`.

**`default` вместо `null`.** Для `int?` пишите `default` осторожно: это `null`, а не `0`.

**Недетерминированность в обобщённом коде.** `default(T)` для `T = string` даёт `null`, и последующий вызов `.Length` упадёт.

## Примеры {#examples}

~~~csharp
Console.WriteLine(default(int));                 // 0
Console.WriteLine(default(bool));                // False
Console.WriteLine(default(char) == '\0');        // True
Console.WriteLine(default(DateTime));
Console.WriteLine(default(string) is null);      // True
Console.WriteLine(default(int?) is null);        // True

static T FirstOrDefaultOf<T>(IEnumerable<T> items) { foreach (var x in items) return x; return default!; }
Console.WriteLine(FirstOrDefaultOf(new List<int>()));      // 0
Console.WriteLine(FirstOrDefaultOf(new List<string>()) is null);   // True
~~~
~~~console
0
False
True
01/01/0001 00:00:00
True
True
0
True
~~~
