@@ref id="ty-declaration" cat="B" title="Объявление переменных, var, область видимости и время жизни" cs="1.0" mem="O(1)" tags="переменная объявление var область видимости scope время жизни definite assignment CS0165 shadowing замыкание foreach локальная переменная" topic="p1-syntax,p1-types" related="ty-defaults,ty-const-readonly,op-assignment,op-lambda" learn="dotnet/csharp/language-reference/statements/declarations::Объявления и локальные переменные"
Локальная переменная объявляется записью `Тип имя = значение;`; её имя действует до конца блока `{ }`, где она объявлена, а значение должно быть определённо присвоено до первого чтения.

## Синтаксис {#syntax}

~~~csharp @nocheck
int count;                    // объявление без значения
int a = 1, b = 2;             // несколько переменных одного типа
var list = new List<int>();   // тип выводится из правой части (C# 3)
List<int> l2 = new();         // target-typed new (C# 9)
using var f = File.OpenRead(path);   // освободится в конце блока
foreach (var item in items) { }      // переменная цикла
if (int.TryParse(s, out var n)) { }  // out-переменная (C# 7)
if (o is string text) { }            // переменная шаблона
~~~

## Семантика {#semantics}

- `var` — не динамический тип: компилятор подставляет точный тип выражения справа, и дальше переменная строго типизирована. Допустим только для локальных переменных (не для полей, параметров, возвращаемых значений) и только если справа есть выражение: `var x;` и `var x = null;` — ошибки.
- **Область видимости — блок.** Имя видно от точки объявления до `}`. Использовать переменную выше её объявления нельзя, даже если она объявлена в том же блоке ниже.
- **Скрытие запрещено:** локальная переменная не может иметь то же имя, что другая локальная переменная в объемлющем блоке (ошибка CS0136). Поле класса скрыть можно — тогда обращаться к нему нужно через `this.`.
- **Определённое присваивание.** Компилятор анализирует все пути выполнения: если хоть один путь доходит до чтения без присваивания, это ошибка CS0165. Поэтому `int x; if (c) x = 1; Console.WriteLine(x);` не компилируется.
- Переменные шаблонов и `out var` остаются в области объемлющего оператора: `if (int.TryParse(s, out var n)) {}` — `n` видна и после `if`, но присвоена определённо только в нужной ветке.
- У каждой итерации `foreach` — своя переменная (с C# 5), у `for` — одна общая.
- Время жизни не равно области видимости: JIT может «забыть» переменную сразу после последнего использования, а переменная, захваченная лямбдой, живёт, пока жив делегат.

## Под капотом {#internals}

Локальные переменные живут в кадре метода на стеке или в регистрах процессора; кадр создаётся при входе в метод и исчезает при выходе. Если переменную захватывает лямбда или локальная функция, компилятор переносит её в сгенерированный класс-замыкание в куче. В релизной сборке JIT не хранит значение дольше, чем нужно (поэтому в отладчике переменная может «пропасть» раньше конца блока). Имена локальных переменных в IL существуют только в отладочной информации.

## Сложность {#complexity}

Объявление бесплатно: это резервирование места в кадре. Для структур `O(размер)` при обнулении кадра. Захваченные переменные добавляют аллокацию замыкания.

## Версии {#versions}

- C# 1.0 — явные типы; C# 3.0 — `var`, анонимные типы.
- C# 7.0 — `out var`, переменные шаблонов, локальные функции.
- C# 8 — `using var`, статические локальные функции; C# 9 — target-typed `new()`.
- C# 10 — `var` для лямбд с естественным типом.

## Ловушки {#pitfalls}

**Чтение до присваивания.**

~~~csharp @nocheck
int total;
if (items.Count > 0) total = items.Sum();
Console.WriteLine(total);        // ❌ CS0165: при пустом списке total не присвоено
~~~

Исправление — задать значение сразу:

~~~csharp
var items = new List<int>();
int total = 0;
if (items.Count > 0) total = items.Sum();
Console.WriteLine(total);        // ✅ 0
~~~
~~~console
0
~~~

**`var` скрывает тип.** `var ratio = 5 / 2;` — это `int` (2), а не `double`. Если тип важен читателю, пишите его явно.

**Одно имя в двух блоках.** Две переменные `i` в соседних `for` допустимы, а вложенные — нет.

**Захват переменной цикла `for`.** Все лямбды видят одну переменную; см. [лямбда-выражения](#/ref/a/op-lambda).

## Примеры {#examples}

~~~csharp
var n = 42;                  // int
var s = "текст";             // string
var d = 3.5;                 // double
var arr = new[] { 1, 2, 3 }; // int[]
var anon = new { Id = 1, Name = "Аня" };
Console.WriteLine($"{n.GetType().Name} {s.GetType().Name} {d.GetType().Name} {arr.GetType().Name}");
Console.WriteLine(anon.Name);

if (int.TryParse("123", out var parsed)) Console.WriteLine(parsed + 1);
Console.WriteLine(parsed);   // видна и после if

{
    int inner = 5;           // область — этот блок
    Console.WriteLine(inner);
}
~~~
~~~console
Int32 String Double Int32[]
Аня
124
123
5
~~~

@@ref id="ty-const-readonly" cat="B" title="const, readonly и static readonly" cs="1.0" mem="O(1)" danger="1" tags="const readonly static readonly константа неизменяемое поле константа времени компиляции версионирование сборки init" topic="p1-types,p1-encapsulation" related="ty-declaration,ty-struct,ty-defaults" learn="dotnet/csharp/language-reference/keywords/const::Ключевое слово const"
`const` — константа, значение которой подставляется в код на этапе компиляции; `readonly` — поле, которое можно записать только в конструкторе или инициализаторе; `static readonly` — одно такое поле на тип.

## Синтаксис {#syntax}

~~~csharp @nocheck
public const int MaxUsers = 100;                  // константа
public const string Title = "App" + "1";          // выражение из констант
public readonly DateTime Created = DateTime.Now;  // поле экземпляра
public static readonly Regex Pattern = new("a+"); // одно на тип
void M() { const double Pi = 3.14; }              // локальная const
~~~

## Семантика {#semantics}

- `const` допустим для чисел, `bool`, `char`, `string`, `enum` и `null` для ссылочных типов. Значение — константное выражение, вычисляемое компилятором. `const` неявно `static`.
- `readonly` разрешает присваивание только в объявлении и в конструкторе того же типа. Значение может вычисляться во время выполнения.
- `static readonly` инициализируется в статическом конструкторе (или инициализаторе) один раз при первом обращении к типу.
- **`readonly` не делает объект неизменяемым:** `readonly List<int> list` нельзя заменить, но можно добавлять элементы. Для значимых типов `readonly` защищает от записи в поля структуры через это поле.
- `readonly struct` и `init`-свойства — способы сделать тип неизменяемым целиком, см. [структуры](#/ref/b/ty-struct).
- Локальные `const` допустимы; `static readonly` для локальных нет.

## Под капотом {#internals}

Обращение к `const` превращается в литерал в IL: поле даже не читается во время выполнения. Это значит, что значение «запекается» в каждую сборку-потребитель. `readonly`-поле читается обычным образом; для `static readonly` JIT после инициализации типа может подставить значение как константу в оптимизированный машинный код (особенно на уровне Tier-1).

## Сложность {#complexity}

`const` — нулевая стоимость; `static readonly` — обращение за `O(1)`, плюс однократная инициализация типа.

## Версии {#versions}

- C# 1.0 — `const`, `readonly`.
- C# 6 — присваивание `readonly`-автосвойствам (`{ get; }`) в конструкторе.
- C# 9 — `init`; C# 11 — `required`.
- C# 8 — `readonly`-члены структур.

## Ловушки {#pitfalls}

**`const` в публичном API и перекомпиляция.** Если библиотека меняет `const`, сборки-потребители продолжат использовать старое значение, пока их не пересоберут. Для значений, которые могут меняться между версиями, используйте `static readonly`.

**Неизменяемость ссылки не равна неизменяемости объекта.**

~~~csharp
var holder = new Holder();
holder.List.Add(1);                      // ❌ readonly не мешает менять содержимое
Console.WriteLine(holder.List.Count);    // 1

class Holder { public readonly List<int> List = new(); }
~~~
~~~console
1
~~~

**Порядок статических инициализаторов.** Поля `static readonly` в одном типе инициализируются в порядке записи; обращение к ещё не инициализированному даёт `null`.

**Нельзя `const` для `DateTime`, `decimal` в атрибутах**, но `const decimal` допустим.

## Примеры {#examples}

~~~csharp
const int Max = 10;
const string Greeting = "Привет, " + "мир";
Console.WriteLine(Max * 2);
Console.WriteLine(Greeting);

var a = new Order(1);
Console.WriteLine($"{a.Id} {Order.Prefix}{a.Id}");

class Order
{
    public static readonly string Prefix = "ORD-";
    public readonly int Id;
    public Order(int id) => Id = id;
}
~~~
~~~console
20
Привет, мир
1 ORD-1
~~~

@@ref id="ty-defaults" cat="B" title="Значения по умолчанию и определённое присваивание" cs="1.0" mem="O(1)" tags="default значение по умолчанию нулевое инициализация поля массива struct definite assignment generic default T обнуление" topic="p1-types" related="ty-declaration,op-default,ty-nullable-value,ty-generics" learn="dotnet/csharp/language-reference/builtin-types/default-values::Значения по умолчанию"
Поля, элементы массивов и статические переменные автоматически получают «нулевое» значение своего типа; локальные переменные — нет, и компилятор требует присвоить их вручную.

## Синтаксис {#syntax}

~~~csharp @nocheck
int x = default;                  // 0
var arr = new int[3];             // 0, 0, 0
class C { int f; string s; }      // f == 0, s == null
T Get<T>() => default!;           // нулевое значение параметра типа
~~~

## Семантика {#semantics}

- Числа — `0`, `bool` — `false`, `char` — `'\0'`, ссылочные типы и `Nullable<T>` — `null`, `enum` — значение `0`, структура — все поля по умолчанию.
- Автоматическое обнуление применяется к **полям** (экземпляра и статическим), **элементам массивов** и объектам, созданным через `new` без конструктора. Для локальных переменных действует правило определённого присваивания (CS0165).
- У структуры `default` обходит любые конструкторы; инварианты, заданные конструктором, не гарантируются.
- У `string` значение по умолчанию — `null`, а не пустая строка. В коде с включённым nullable-анализом это отражается предупреждением для неинициализированных полей (CS8618).
- Для параметра типа `T` значение по умолчанию — `null` или нулевая структура в зависимости от аргумента типа.
- Значение `default(DateTime)` — 1 января 0001, `default(Guid)` — нулевой GUID.
- Массивы структур и полей структур обнуляются целиком одной операцией, а не поэлементно.
- Явное присваивание `= 0` или `= null` в объявлении поля не стоит ничего лишнего: компилятор вставит его в конструктор, но память всё равно была обнулена.
- Инициализаторы полей выполняются до тела конструктора и до вызова конструктора базового класса, поэтому виртуальный вызов из конструктора может увидеть ещё нулевые поля производного класса.

## Под капотом {#internals}

CLR выдаёт нулевую память для объектов в куче, поэтому поля нулевые «бесплатно». Для локальных переменных-структур компилятор вставляет `initobj`, если без неё есть риск прочитать мусор. Атрибут `[SkipLocalsInit]` отключает обнуление локальных буферов (например, для `stackalloc`) ради скорости.

## Сложность {#complexity}

Обнуление массива — `O(n)` при выделении; поля — вместе с выделением объекта.

## Версии {#versions}

- C# 1.0 — правила для полей и массивов; C# 2.0 — `default(T)`; C# 7.1 — литерал `default`.
- C# 8 — предупреждения о неинициализированных non-nullable полях.
- C# 11 — `required` членам запрещает «забыть» значение.

## Ловушки {#pitfalls}

**Массив ссылочных типов состоит из `null`.**

~~~csharp
var names = new string[2];
Console.WriteLine(names[0] is null);     // True
try { Console.WriteLine(names[0].Length); }   // ❌ NullReferenceException
catch (NullReferenceException) { Console.WriteLine("NRE"); }
Array.Fill(names, "");                   // ✅ задать значение явно
Console.WriteLine(names[0].Length);
~~~
~~~console
True
NRE
0
~~~

**Перечисление без нулевого члена.** `default(Level)` — значение `0`, которого нет среди имён.

**`Nullable<int>` по умолчанию — `null`, а не `0`.**

## Примеры {#examples}

~~~csharp
Console.WriteLine(default(int));
Console.WriteLine(default(bool));
Console.WriteLine(default(double));
Console.WriteLine(default(DateTime));
Console.WriteLine(default(Guid));
Console.WriteLine(default(string) is null);
Console.WriteLine(default(int?) is null);
Console.WriteLine(new int[2].Length + new bool[1].Length);

var s = new S();
Console.WriteLine($"{s.A} {s.B is null}");

struct S { public int A; public string B; }
~~~
~~~console
0
False
0
01/01/0001 00:00:00
00000000-0000-0000-0000-000000000000
True
True
3
0 True
~~~

@@ref id="ty-builtin" cat="B" title="Встроенные типы: размеры и диапазоны" cs="1.0" mem="O(1)" table="1" tags="int long byte short sbyte uint ulong float double decimal char bool nint диапазон размер MinValue MaxValue Int128 Half встроенные типы таблица" topic="p1-types" related="ty-literals,ty-floating,ty-char,op-overflow,op-arithmetic" learn="dotnet/csharp/language-reference/builtin-types/built-in-types::Встроенные типы"
В C# есть 13 числовых и простых встроенных типов, у каждого — фиксированный размер и диапазон; таблица ниже сортируется по любому столбцу.

## Синтаксис {#syntax}

~~~csharp @nocheck
sbyte  byte  short  ushort  int  uint  long  ulong   // целые
nint   nuint                                          // размер указателя
float  double  decimal                                // вещественные
bool   char                                           // логический, символ
Int128  UInt128  Half                                 // структуры BCL (.NET 5–7), без ключевых слов
~~~

## Семантика {#semantics}

:::sortable Размеры и диапазоны

| Тип | .NET-тип | Размер, байт | Диапазон или точность |
|---|---|---|---|
| `sbyte` | `System.SByte` | 1 | −128 … 127 |
| `byte` | `System.Byte` | 1 | 0 … 255 |
| `short` | `System.Int16` | 2 | −32 768 … 32 767 |
| `ushort` | `System.UInt16` | 2 | 0 … 65 535 |
| `int` | `System.Int32` | 4 | −2 147 483 648 … 2 147 483 647 |
| `uint` | `System.UInt32` | 4 | 0 … 4 294 967 295 |
| `long` | `System.Int64` | 8 | −9 223 372 036 854 775 808 … 9 223 372 036 854 775 807 |
| `ulong` | `System.UInt64` | 8 | 0 … 18 446 744 073 709 551 615 |
| `nint` / `nuint` | `IntPtr` / `UIntPtr` | 4 или 8 | зависит от разрядности процесса |
| `float` | `System.Single` | 4 | ≈ ±3,4·10³⁸, 6–9 значащих цифр |
| `double` | `System.Double` | 8 | ≈ ±1,7·10³⁰⁸, 15–17 цифр |
| `decimal` | `System.Decimal` | 16 | ≈ ±7,9·10²⁸, 28–29 цифр, десятичная основа |
| `bool` | `System.Boolean` | 1 | `true` / `false` |
| `char` | `System.Char` | 2 | 0 … 65 535 (код UTF-16) |

:::

- `int` — тип по умолчанию для целых литералов, `double` — для вещественных, `decimal` нужен для денег.
- Размер в таблице — для хранения в поле или массиве; одиночные локальные значения могут занимать регистр целиком.
- Беззнаковые типы не соответствуют CLS (не рекомендуются в публичных API общего назначения).
- `sizeof` для встроенных типов — константа: см. [typeof и sizeof](#/ref/a/op-typeof-sizeof).
- Типы `Int128`, `UInt128` (.NET 7), `Half` (.NET 5) — структуры без ключевого слова.

## Под капотом {#internals}

Встроенные типы — это псевдонимы типов из `System`: `int` и `Int32` — один и тот же тип. Значения хранятся без заголовка объекта, прямо в поле, элементе массива или регистре. Целые используют дополнительный код, вещественные — IEEE 754 (`decimal` — собственный десятичный формат с масштабом 0–28).

## Сложность {#complexity}

Операции над встроенными типами — `O(1)`; `decimal` и `Int128` заметно медленнее аппаратных `int`/`double`, потому что реализованы программно.

## Версии {#versions}

- C# 1.0 — основные типы; C# 9 — `nint`, `nuint`.
- .NET 5 — `Half`; .NET 7 — `Int128`, `UInt128`.

## Ловушки {#pitfalls}

**Выход за диапазон в целых.**

~~~csharp
int big = int.MaxValue;
Console.WriteLine(big + 1);              // ❌ -2147483648: молчаливое переполнение
Console.WriteLine((long)big + 1);        // ✅ 2147483648
~~~
~~~console
-2147483648
2147483648
~~~

**`float` для денег.** Двоичные дроби не представляют 0,1 точно; используйте `decimal`, см. [числа с плавающей точкой](#/ref/b/ty-floating).

**`char` — не символ Unicode целиком.** Суррогатные пары занимают два `char`.

**`long` в 32-битном процессе** читается не атомарно.

## Примеры {#examples}

~~~csharp
Console.WriteLine($"{sbyte.MinValue} {sbyte.MaxValue}");
Console.WriteLine($"{byte.MaxValue} {short.MinValue} {ushort.MaxValue}");
Console.WriteLine($"{int.MinValue} {int.MaxValue} {uint.MaxValue}");
Console.WriteLine($"{long.MinValue} {ulong.MaxValue}");
Console.WriteLine($"{sizeof(int)} {sizeof(long)} {sizeof(decimal)} {sizeof(char)} {sizeof(bool)}");
Console.WriteLine(typeof(int) == typeof(Int32));
Console.WriteLine(decimal.MaxValue);
Console.WriteLine(float.MaxValue > 3e38f);
~~~
~~~console
-128 127
255 -32768 65535
-2147483648 2147483647 4294967295
-9223372036854775808 18446744073709551615
4 8 16 2 1
True
79228162514264337593543950335
True
~~~
