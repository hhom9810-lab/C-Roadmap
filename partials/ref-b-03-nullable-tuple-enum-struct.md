@@ref id="ty-nullable-value" cat="B" title="Nullable value types (int?, Nullable<T>)" cs="2.0" mem="O(1)" tags="nullable int? Nullable<T> HasValue Value GetValueOrDefault lifted операторы null значимый тип boxing nullable" topic="p1-types,p1-boxing" related="ty-nullable-ref,op-null-coalescing,op-null-conditional,op-comparison,ty-boxing" learn="dotnet/csharp/language-reference/builtin-types/nullable-value-types::Nullable-типы значений"
`T?` для значимого типа — это структура `Nullable<T>`, которая хранит значение вместе с флагом «есть ли оно» и позволяет представить отсутствие значения как `null`.

## Синтаксис {#syntax}

~~~csharp @nocheck
int? n = null;   int? m = 5;   Nullable<int> k = 7;
if (n.HasValue) { var v = n.Value; }
int x = n ?? 0;               int y = n.GetValueOrDefault(10);
if (m is int value) { }       // распаковка шаблоном
double? avg = list.Count > 0 ? list.Average() : null;
~~~

## Семантика {#semantics}

- `Nullable<T>` — структура с полями `bool hasValue` и `T value`. `T` обязан быть значимым типом (не `string`, не `int?`).
- Неявное преобразование `T → T?`, явное `T? → T` (бросает `InvalidOperationException`, если значения нет). Безопасно: `??`, `GetValueOrDefault`, `is int v`.
- **Поднятые (lifted) операторы:** арифметика с `null` даёт `null` (`5 + null` → `null`); сравнения `<`, `>`, `<=`, `>=` с `null` — `false`; `==` и `!=` работают: `null == null` истинно.
- Для `bool?` логика трёхзначная ([см. логические операторы](#/ref/a/op-logical)).
- **Упаковка:** `object o = (int?)null` даёт `null`, а не коробку; `(int?)5` упаковывается как обычный `int` в коробке. Распаковка `(int?)o` работает и для `null`, и для коробки `int`.
- `GetType()` на `int?` с значением возвращает `Int32`, а при `null` — бросает `NullReferenceException`, потому что сначала происходит упаковка.
- `default(int?)` — `null`.
- В `switch` и шаблонах: `x is null`, `x is > 5` (для `null` ложь), `x is int`.
- Методы LINQ по `int?`: `Sum` пропускает `null`, `Average` считает только значения, `Max`/`Min` на пустой последовательности вернут `null`.

## Под капотом {#internals}

Структура занимает `sizeof(T)` плюс выравненный флаг: `int?` — 8 байт, `long?` — 16 (из-за выравнивания), `bool?` — 2. Компилятор разворачивает поднятые операторы в проверку `HasValue` и операцию. CLR обрабатывает `Nullable<T>` особо при упаковке: коробка хранит `T`, а не `Nullable<T>`.

## Сложность {#complexity}

Операции — `O(1)`, дополнительная проверка флага. Хранение — на 1 флаг больше (с выравниванием); для массивов миллионов значений это заметно.

## Версии {#versions}

- C# 2.0 / .NET 2.0 — `Nullable<T>`, `?`, `??`.
- C# 6 — `?.` для nullable; C# 7 — шаблоны `is int v`.
- C# 8 — рядом появились nullable reference types (другая функция).

## Ловушки {#pitfalls}

**Сравнение с `null` и «не меньше» не означает «больше».**

~~~csharp
int? a = null;
Console.WriteLine(a < 5);        // False
Console.WriteLine(a >= 5);       // False
Console.WriteLine(a != 5);       // ❌ True: null != 5
Console.WriteLine(a.GetValueOrDefault() < 5);   // ✅ явно: 0 < 5
try { Console.WriteLine(a.Value); }
catch (InvalidOperationException) { Console.WriteLine("нет значения"); }
~~~
~~~console
False
False
True
True
нет значения
~~~

**`.Value` без проверки** бросает исключение; предпочитайте `??` или шаблон.

**Дважды вложенный `T??` не существует.** `Nullable<Nullable<int>>` запрещён.

**Агрегаты.** `list.Sum()` по `int?` пропускает `null`, а `Max()` на пустой коллекции вернёт `null`.

## Примеры {#examples}

~~~csharp
int? a = 5, b = null;
Console.WriteLine(a + b is null);        // True
Console.WriteLine(a + 1);                // 6
Console.WriteLine(b ?? -1);
Console.WriteLine(b.HasValue + " " + a.HasValue);

object boxed = a;
Console.WriteLine(boxed.GetType().Name); // Int32
object none = b;
Console.WriteLine(none is null);         // True

if (a is int v && v > 3) Console.WriteLine("больше трёх: " + v);
int?[] data = { 1, null, 3 };
Console.WriteLine(data.Sum());           // 4
~~~
~~~console
True
6
-1
False True
Int32
True
больше трёх: 5
4
~~~

@@ref id="ty-nullable-ref" cat="B" title="Nullable reference types (string?, #nullable)" cs="8.0" mem="O(1)" danger="1" tags="nullable reference types NRT string? #nullable enable CS8600 CS8602 CS8618 NotNullWhen MaybeNull required предупреждения null-анализ" topic="p1-types" related="ty-nullable-value,op-null-forgiving,op-null-conditional,op-null-coalescing" learn="dotnet/csharp/nullable-references::Nullable-ссылочные типы"
Nullable reference types — это статический анализ: аннотация `string?` говорит компилятору, что значение может быть `null`, а `string` — что не должно; в рантайме тип один и тот же и проверок нет.

## Синтаксис {#syntax}

~~~csharp @nocheck
<Nullable>enable</Nullable>          // в .csproj
#nullable enable                     // в файле (или disable / restore)
string name = "x";   string? maybe = null;
public string Name { get; set; } = "";
required string Title { get; init; }       // C# 11
bool TryGet(string key, [NotNullWhen(true)] out string? value)
T? Find<T>(...) where T : class
~~~

## Семантика {#semantics}

- Контекст включается проектом (`<Nullable>enable</Nullable>` по умолчанию в новых шаблонах) или директивами. В нём ссылочный тип без `?` считается не-`null`, с `?` — допускающим `null`.
- Анализатор отслеживает «состояние null» каждой переменной: после `if (s != null)` это не-`null`, после присваивания `null` — может быть `null`. Нарушения — **предупреждения** (CS8600–CS8604, CS8618…), не ошибки: код всё равно компилируется.
- Атрибуты (`System.Diagnostics.CodeAnalysis`) описывают поведение методов: `[NotNullWhen]`, `[MaybeNullWhen]`, `[NotNull]`, `[DoesNotReturn]`, `[MemberNotNull]`, `[AllowNull]`.
- Поля и свойства без значения по умолчанию должны получить значение в конструкторе, иначе CS8618; модификатор `required` (C# 11) переносит обязанность на инициализатор объекта.
- Подавить предупреждение — [оператор `!`](#/ref/a/op-null-forgiving).
- В обобщённом коде `T?` без ограничения трудно трактовать; ограничения `class?`, `notnull` помогают.
- Анализ работает на уровне метода и вызовов: заранее известные пути присваивания учитываются, а динамически сложные (в цикле или через поля) могут давать ложные срабатывания.
- Рантайм ничего не проверяет: `string s = null!;` скомпилируется и выбросит NRE при первом использовании.

## Под капотом {#internals}

Аннотации записываются в метаданные атрибутами `[Nullable]` и `[NullableContext]`; для CLR `string` и `string?` — один тип. Поэтому библиотеки без аннотаций «oblivious» для анализа, а внешний код может передать `null` в метод, формально не принимающий его, без защиты на уровне платформы.

## Сложность {#complexity}

Нулевые затраты времени выполнения: это работа компилятора (немного замедляет сборку). Защитные проверки (`ThrowIfNull`) стоят одну проверку на ссылку.

## Версии {#versions}

- C# 8 — NRT; C# 9 — `T?` для параметров типа и `is not null`; C# 10 — улучшенный анализ состояния.
- C# 11 — `required`, `[SetsRequiredMembers]`; .NET 6 — `ArgumentNullException.ThrowIfNull`.

## Ловушки {#pitfalls}

**Включённый анализ не защищает от `null` из внешнего мира.**

~~~csharp
#nullable enable
string? input = null;
Console.WriteLine(input?.Length);                 // (пусто): безопасно
static int Len(string s) => s.Length;
try { Console.WriteLine(Len(null!)); }            // ❌ ! заглушил предупреждение, NRE в рантайме
catch (NullReferenceException) { Console.WriteLine("NRE"); }
~~~
~~~console

NRE
~~~

**Десериализация и ORM** создают объекты в обход конструктора: свойства остаются `null`, хотя типы non-nullable. Используйте `required` или `= default!` осознанно.

**Предупреждения как шум.** Если их не исправлять, анализатор теряет смысл; включайте «предупреждения как ошибки» для NRT в новых проектах.

**`string?` и `Nullable<string>`** — разные вещи: `Nullable<T>` только для структур.

## Примеры {#examples}

~~~csharp
#nullable enable
static string Greet(string? name) => name is null ? "Привет, аноним" : $"Привет, {name}";
Console.WriteLine(Greet(null));
Console.WriteLine(Greet("Аня"));

static bool TryParsePositive(string? s, out int value)
{
    value = 0;
    return int.TryParse(s, out value) && value > 0;
}
Console.WriteLine(TryParsePositive("5", out var n) + " " + n);

string[] items = { "a", "bb" };
string? first = items.FirstOrDefault(x => x.Length > 5);
Console.WriteLine(first ?? "не найдено");
~~~
~~~console
Привет, аноним
Привет, Аня
True 5
не найдено
~~~

@@ref id="ty-tuples" cat="B" title="Кортежи и деконструкция" cs="7.0" mem="O(размер)" tags="tuple ValueTuple кортеж деконструкция Deconstruct именованные элементы discard (a, b) возврат нескольких значений" topic="p1-methods,p1-types" related="ty-struct,op-pattern-property,op-assignment,op-comparison" learn="dotnet/csharp/language-reference/builtin-types/value-tuples::Кортежи"
Кортеж `(int, string)` — лёгкая структура `ValueTuple` для группы значений без объявления отдельного типа, а деконструкция раскладывает такую группу по переменным.

## Синтаксис {#syntax}

~~~csharp @nocheck
(int, string) t = (1, "a");
var p = (Id: 1, Name: "Аня");           // именованные элементы
Console.WriteLine(p.Name + p.Item2);
var (id, name) = p;                     // деконструкция
(int x, int y) = (3, 4);
(a, b) = (b, a);                        // обмен
var (q, _) = Divide(7, 2);              // discard
(int Min, int Max) Range(int[] a) => (a.Min(), a.Max());
~~~

## Семантика {#semantics}

- Кортеж — **значимый** тип `System.ValueTuple<T1…T7, TRest>`; копируется по значению, элементы изменяемы (`p.Id = 2` допустимо для переменной).
- Имена элементов существуют только на этапе компиляции: в IL это `Item1`, `Item2`…; сохраняются в атрибуте `TupleElementNames` для сигнатур, но не видны рефлексии и при приведении к `object`.
- Кортежи с одинаковыми типами в одном порядке **преобразуются** друг в друга независимо от имён (с предупреждением, если имена разные).
- `==` и `!=` сравнивают поэлементно (C# 7.3); `Equals` и `GetHashCode` комбинируют элементы, поэтому кортеж годится как ключ словаря.
- **Деконструкция:** для кортежа — автоматическая; для своего типа — метод `Deconstruct(out …)` (в том числе расширяющий); в `record` он генерируется.
- Кортеж удобен для возврата нескольких значений из приватных методов и для временной группировки в LINQ (`Select(x => (x.Id, x.Name))`).
- Discard `_` пропускает элемент. Деконструкцию можно сочетать с присваиванием существующим переменным: `(x, y) = (y, x)`.
- Элементов больше 7 вкладываются в `TRest`, обращение — `Rest.Item1`.

## Под капотом {#internals}

`(int, string)` — `ValueTuple<int, string>`: структура на стеке или в поле, без аллокации. Для возврата из метода значения копируются (через регистры или скрытый указатель). Обмен `(a, b) = (b, a)` компилятор реализует через временные переменные без создания кортежа.

## Сложность {#complexity}

`O(размер)` на копирование; аллокаций нет. Крупные кортежи (> 16 байт) лучше заменять `record struct` или передавать по `in`.

## Версии {#versions}

- C# 7.0 — кортежи, деконструкция, `System.ValueTuple` (в .NET Framework 4.7+ или NuGet).
- C# 7.3 — `==` и `!=` для кортежей; C# 10 — смешанное присваивание и объявление `(x, var y) = …`.
- C# 12 — алиасы кортежей `using Point = (int X, int Y);`.

## Ловушки {#pitfalls}

**Имена не часть типа.**

~~~csharp
var a = (Id: 1, Name: "x");
(int Code, string Text) b = a;                 // допустимо: имена другие, типы те же
Console.WriteLine(b.Code);                      // 1
object o = a;
Console.WriteLine(o.GetType().Name);            // ValueTuple`2
Console.WriteLine(((ValueTuple<int, string>)o).Item2);   // x: имён уже нет
~~~
~~~console
1
ValueTuple`2
x
~~~

**Кортеж как публичный контракт.** Изменение порядка или количества элементов ломает вызывающий код без предупреждения; для API лучше `record`.

**`System.Tuple`** (класс) — старый ссылочный тип; в новом коде его не используют.

**Изменяемая копия.** Присвоение кортежа копирует; изменение копии не меняет оригинал.

## Примеры {#examples}

~~~csharp
static (int Min, int Max) Bounds(int[] a) => (a.Min(), a.Max());
var (lo, hi) = Bounds(new[] { 5, 2, 9 });
Console.WriteLine($"{lo} {hi}");

int x = 1, y = 2;
(x, y) = (y, x);
Console.WriteLine($"{x} {y}");

Console.WriteLine((1, "a") == (1, "a"));
var set = new HashSet<(int, int)> { (1, 2) };
Console.WriteLine(set.Contains((1, 2)));

var pt = new Pt(3, 4);
var (px, py) = pt;
Console.WriteLine(px * py);

record Pt(int X, int Y);
~~~
~~~console
2 9
2 1
True
True
12
~~~

@@ref id="ty-enum" cat="B" title="enum и [Flags]" cs="1.0" mem="O(1)" danger="1" tags="enum перечисление Flags битовые флаги Enum.Parse TryParse IsDefined HasFlag базовый тип byte int значения по умолчанию GetValues" topic="p1-types" related="op-bitwise,op-switch-expression,ty-defaults,ty-generics" learn="dotnet/csharp/language-reference/builtin-types/enum::Перечисления"
`enum` — именованный набор целочисленных констант; по умолчанию базовый тип `int`, а с атрибутом `[Flags]` значения комбинируются битовыми операциями.

## Синтаксис {#syntax}

~~~csharp @nocheck
enum Color { Red, Green, Blue }                  // 0, 1, 2
enum Level : byte { Low = 1, High = 10 }          // базовый тип byte
[Flags] enum Perm { None = 0, Read = 1, Write = 2, Exec = 4, All = Read | Write | Exec }
var c = Color.Green;   int i = (int)c;   Color d = (Color)2;
Enum.TryParse<Color>("Blue", out var parsed);
Enum.GetValues<Color>();   Enum.IsDefined(typeof(Color), 5);
~~~

## Семантика {#semantics}

- Базовый тип — любой целочисленный (`byte`, `int`, `long`…, кроме `char`). Если значения не заданы, нумерация идёт с 0 по возрастанию; следующий член — предыдущий + 1.
- **Приведение из числа не проверяется:** `(Color)42` допустимо и создаёт «неопределённое» значение. Для проверки — `Enum.IsDefined`.
- `ToString()` возвращает имя; для значения без имени — число, а для `[Flags]` — список через запятую (`Read, Write`).
- Для `[Flags]` значения должны быть степенями двойки (`1, 2, 4, 8…`) или их комбинациями; обязательно нулевой член `None = 0`.
- Операции `| & ^ ~` определены для enum; `HasFlag(f)` проверяет, что все биты `f` установлены (для `f = 0` всегда истина).
- Сравнения, `==`, `switch` работают по значению. Арифметика допустима (`c + 1`), но тип результата — enum.
- `Enum.Parse`/`TryParse` разбирают и имена, и числа (`"5"` → `(Color)5`!) — это неожиданность для пользовательского ввода.
- Метод `Enum.GetValues<T>()` и `GetNames<T>()` — типобезопасные версии (.NET 5).

## Под капотом {#internals}

Enum — значимый тип, хранится как свой базовый тип; никаких накладных расходов. Перечисление компилируется в класс с константными полями. `ToString`, `Parse` и `IsDefined` используют рефлексию над метаданными, поэтому они медленнее обычных операций (но результаты кэшируются).

## Сложность {#complexity}

Сравнения и битовые операции — `O(1)`. `ToString`, `Parse` — `O(k)` по числу членов (в современных версиях быстро); `HasFlag` — `O(1)` в оптимизированном коде.

## Версии {#versions}

- C# 1.0 — `enum`, `[Flags]`; C# 7.3 — ограничение `where T : struct, Enum`.
- .NET 5 — `Enum.GetValues<T>()`, `Enum.GetName<T>`, `Enum.IsDefined<T>`.
- C# 8 — `switch`-выражения с исчерпывающей проверкой по enum.

## Ловушки {#pitfalls}

**Значения без степеней двойки в `[Flags]`.**

~~~csharp
Console.WriteLine(Bad.A | Bad.B);               // ❌ C, а не «A, B»: C = A | B — неоднозначно

Console.WriteLine(Enum.TryParse<Color>("7", out var c) + " " + c);   // ❌ True 7: число — не член
Console.WriteLine(Enum.IsDefined(typeof(Color), 7));                 // ✅ False

[Flags] enum Bad { A = 1, B = 2, C = 3 }
enum Color { Red, Green, Blue }
~~~
~~~console
C
True 7
False
~~~

**`HasFlag(None)`** всегда `true`; проверяйте через `(x & f) == f` и `f != 0`.

**Сериализация числом.** Сохранённые в БД числа ломаются при перестановке членов; задавайте значения явно и не меняйте их.

**Новый член и `switch`.** Без `_` и `default` анализатор предупредит; с `_` — молча проигнорирует.

## Примеры {#examples}

~~~csharp
Perm p = Perm.Read | Perm.Write;
Console.WriteLine(p);
Console.WriteLine(p.HasFlag(Perm.Write) + " " + p.HasFlag(Perm.Exec));
p &= ~Perm.Write;
Console.WriteLine(p);
Console.WriteLine((int)Perm.All);
Console.WriteLine(string.Join(",", Enum.GetValues<Color>()));
Console.WriteLine((Color)1);
Console.WriteLine((Color)9);
Console.WriteLine(Enum.Parse<Color>("blue", ignoreCase: true));

[Flags] enum Perm { None = 0, Read = 1, Write = 2, Exec = 4, All = Read | Write | Exec }
enum Color { Red, Green, Blue }
~~~
~~~console
Read, Write
True False
Read
7
Red,Green,Blue
Green
9
Blue
~~~

@@ref id="ty-struct" cat="B" title="struct, readonly struct, ref struct, record struct" cs="1.0" mem="O(размер)" danger="1" tags="struct структура значимый тип readonly struct ref struct record struct копирование изменяемая структура Span стек 16 байт" topic="p1-types,p1-boxing" related="ty-boxing,ty-span,ty-const-readonly,op-with,op-ref-out-in" learn="dotnet/csharp/language-reference/builtin-types/struct::Типы структур"
Структура — значимый тип: переменная хранит сами данные, и при присваивании, передаче в метод и возврате значение копируется целиком.

## Синтаксис {#syntax}

~~~csharp @nocheck
struct Point { public int X, Y; }
readonly struct Money { public decimal Amount { get; init; } }
ref struct Buffer { Span<byte> data; }             // только на стеке
record struct Pair(int A, int B);                   // C# 10
readonly record struct Id(int Value);
struct S { public S() { X = 1; } public int X; }     // C# 10: конструктор без параметров
~~~

## Семантика {#semantics}

- Присваивание `b = a` копирует все поля; изменения копии не затрагивают оригинал.
- Структура не поддерживает наследование (кроме интерфейсов), всегда запечатана, наследует `System.ValueType`.
- **`readonly struct`** гарантирует неизменяемость: все поля `readonly`, компилятор избегает защитных копий при вызове методов через `in`.
- **`ref struct`** (`Span<T>`, ваши типы) живёт только на стеке: нельзя поместить в поле класса, упаковать, захватить в лямбду или использовать в `async`-методе.
- **`record struct`** (C# 10) добавляет равенство по значению, `ToString`, деконструкцию и `with`.
- Конструктор без параметров разрешён с C# 10, но `default(S)` и `new S[n]` его **не вызывают**.
- Поля структуры должны быть присвоены до первого использования `this` (C# 11 ослабило: неприсвоенные автоматически обнуляются).
- Хорошая структура: небольшая (≈ до 16 байт), неизменяемая, представляет одно значение (точка, дата, деньги).
- `==` для структуры не определён автоматически, а `Equals` по умолчанию использует рефлексию — **медленно**; переопределите или используйте `record struct`.

## Под капотом {#internals}

Локальные структуры лежат на стеке (или в регистрах), поля структур — внутри объекта-владельца, элементы массивов структур — подряд в одном блоке памяти (хорошая локальность кэша). Упаковка (boxing) превращает структуру в объект в куче. Вызов метода через `readonly`-поле или `in`-параметр изменяемой структуры заставляет компилятор делать копию, чтобы защитить оригинал.

## Сложность {#complexity}

Копирование — `O(размер)`. Структуры исключают аллокации и нагрузку на GC, но крупные структуры, передаваемые по значению, медленнее ссылки; передавайте по `in`/`ref`.

## Версии {#versions}

- C# 1.0 — `struct`; C# 7.2 — `readonly struct`, `ref struct`, `in`.
- C# 8 — `readonly`-члены; C# 10 — `record struct`, конструкторы без параметров.
- C# 11 — `ref`-поля, автоматическое обнуление полей; C# 13 — `ref struct` могут реализовывать интерфейсы.

## Ловушки {#pitfalls}

**Изменение копии вместо оригинала.**

~~~csharp
var list = new List<P> { new P { X = 1 } };
var copy = list[0];
copy.X = 99;                              // ❌ меняем копию
Console.WriteLine(list[0].X);             // 1
// list[0].X = 99;                        // CS1612: компилятор запрещает
var p = list[0]; p.X = 99; list[0] = p;   // ✅ записать обратно
Console.WriteLine(list[0].X);

struct P { public int X; }
~~~
~~~console
1
99
~~~

**Изменяемые структуры.** Делайте их `readonly`; изменяемые приводят к трудноуловимым ошибкам.

**Боксинг при приведении к интерфейсу** и использование в необобщённых коллекциях.

**Большие структуры** по значению в горячем коде — потеря производительности.

## Примеры {#examples}

~~~csharp
var a = new Money(5, "RUB");
var b = a with { Amount = 10 };
Console.WriteLine($"{a} {b}");
Console.WriteLine(a == new Money(5, "RUB"));

Span<int> span = stackalloc int[3];
span[0] = 7;
Console.WriteLine(span[0]);

var arr = new Pt[2];
arr[1].X = 4;                      // в массиве структуры меняются на месте
Console.WriteLine(arr[1].X);

readonly record struct Money(decimal Amount, string Cur);
struct Pt { public int X; }
~~~
~~~console
Money { Amount = 5, Cur = RUB } Money { Amount = 10, Cur = RUB }
True
7
4
~~~
