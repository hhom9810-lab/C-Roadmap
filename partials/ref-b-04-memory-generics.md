@@ref id="ty-span" cat="B" title="Span<T>, ReadOnlySpan<T> и Memory<T>" cs="7.2" cx="O(1)" mem="O(1)" tags="Span ReadOnlySpan Memory срез без копирования AsSpan slice stackalloc ref struct MemoryMarshal CollectionsMarshal парсинг без аллокаций" topic="p1-strings,p2-bigo" related="ty-struct,ty-string,op-range-index,op-stackalloc,ty-arrays" learn="?dotnet/standard/memory-and-spans/::Memory<T> и Span<T>"
`Span<T>` — безопасная «ссылка на непрерывный кусок памяти» (массива, строки, стека или нативной памяти) с длиной; она позволяет читать и писать фрагмент без копирования и аллокаций.

## Синтаксис {#syntax}

~~~csharp @nocheck
Span<int> s = new int[10];            Span<int> part = s.Slice(2, 3);   // или s[2..5]
ReadOnlySpan<char> text = "hello".AsSpan();
Span<byte> stack = stackalloc byte[256];
Memory<byte> m = new byte[100];       Span<byte> view = m.Span;
int.Parse(text[1..3]);                // разбор без Substring
CollectionsMarshal.AsSpan(list);      // доступ к внутреннему массиву List<T>
~~~

## Семантика {#semantics}

- `Span<T>` — `ref struct`: ссылка + длина. Изменяя элементы среза, вы изменяете исходные данные (кроме `ReadOnlySpan<T>`).
- Срез через `Slice(start, length)` или `s[a..b]` — **O(1)**, без копирования ([индексы и диапазоны](#/ref/a/op-range-index)).
- Ограничения `ref struct`: нельзя хранить в поле класса или обычной структуры, использовать в `async`/итераторах (до C# 13), захватывать лямбдой, упаковывать, использовать как аргумент типа обычного generic.
- `Memory<T>` и `ReadOnlyMemory<T>` — обычные структуры, которые можно хранить и передавать в `async`; свойство `.Span` даёт `Span<T>` на время работы.
- `ReadOnlySpan<char>` из строки — способ разбирать текст без `Substring`; `string.Create`, `Split` на спанах (`MemoryExtensions.Split`, .NET 9) и `int.Parse(ReadOnlySpan<char>)` не аллоцируют.
- `Span<T>` на массиве ковариантного типа проверяет тип при создании (`ArrayTypeMismatchException`).
- `Span<T>.Empty`, `default` — пустой срез; `IsEmpty` проверяет длину.
- Сравнение `==` сравнивает ссылку и длину, а не содержимое; содержимое — `SequenceEqual`.

## Под капотом {#internals}

Структура содержит управляемый указатель (`ref T`) и `int Length`: 16 байт на 64-битной платформе. Доступ по индексу проверяет границы (JIT убирает проверку в простых циклах). Для работы на стеке есть `stackalloc` ([подробнее](#/ref/a/op-stackalloc)). `Memory<T>` хранит объект-владелец, смещение и длину.

## Сложность {#complexity}

Создание, срез, индексатор — `O(1)`; копирование `CopyTo` — `O(n)`. Главный выигрыш — отсутствие аллокаций, значит — меньше нагрузки на GC.

## Версии {#versions}

- C# 7.2 / .NET Core 2.1 — `Span<T>`, `ReadOnlySpan<T>`, `Memory<T>`.
- .NET 5 — `CollectionsMarshal.AsSpan`; C# 12 — коллекционные выражения для `Span<T>`.
- C# 13 — `ref struct` допускаются в `async`-методах вне `await` и в итераторах (с ограничениями); `allows ref struct`.

## Ловушки {#pitfalls}

**Срез строки без копирования и последующая «потеря».** Спан не продлевает жизнь данных на стеке:

~~~csharp @nocheck
Span<int> Bad() { Span<int> s = stackalloc int[4]; return s; }   // ❌ CS8352: ссылка на стек ушла бы наружу
~~~

Безопасная альтернатива — вернуть массив или заполнить буфер вызывающего:

~~~csharp
static int FillAndSum(Span<int> buffer)
{
    for (int i = 0; i < buffer.Length; i++) buffer[i] = i;
    int sum = 0;
    foreach (var v in buffer) sum += v;
    return sum;
}
Span<int> buf = stackalloc int[5];
Console.WriteLine(FillAndSum(buf));
~~~
~~~console
10
~~~

**`await` и `Span`.** Используйте `Memory<T>`.

**`==` для сравнения содержимого** — сравнивает ссылки; нужен `SequenceEqual`.

**Изменение списка при удержании `AsSpan`**: после роста `List<T>` спан указывает на старый массив.

## Примеры {#examples}

~~~csharp
ReadOnlySpan<char> line = "id=42;name=Аня";
int eq = line.IndexOf('=');
int semi = line.IndexOf(';');
int id = int.Parse(line.Slice(eq + 1, semi - eq - 1));
Console.WriteLine(id + 1);

int[] data = { 1, 2, 3, 4, 5 };
Span<int> mid = data.AsSpan(1, 3);
mid[0] = 20;
Console.WriteLine(string.Join(",", data));
Console.WriteLine(mid.SequenceEqual(new[] { 20, 3, 4 }));

Memory<int> mem = data;
Console.WriteLine(mem.Slice(3).Length);
~~~
~~~console
43
1,20,3,4,5
True
2
~~~

@@ref id="ty-arrays" cat="B" title="Массивы: одномерные, прямоугольные, зубчатые, inline" cs="1.0" cx="O(1)" mem="O(n)" danger="1" tags="массив array многомерный зубчатый jagged int[,] int[][] InlineArray ковариантность массивов Array.Resize Length границы IndexOutOfRange" topic="p1-types,p2-list" related="ty-span,op-new,op-range-index,ty-variance" learn="dotnet/csharp/language-reference/builtin-types/arrays::Массивы"
Массив — объект фиксированной длины в куче, хранящий элементы одного типа подряд; индексация идёт с нуля, а выход за границы приводит к `IndexOutOfRangeException`.

## Синтаксис {#syntax}

~~~csharp @nocheck
int[] a = new int[5];        int[] b = { 1, 2, 3 };       int[] c = [1, 2, 3];
int[,] grid = new int[3, 4];                     // прямоугольный (одна область памяти)
int[][] jag = new int[3][];  jag[0] = new int[2];   // зубчатый (массив массивов)
a.Length   grid.GetLength(0)   grid.Rank
Array.Resize(ref a, 10);   Array.Copy(src, dst, n);   Array.Sort(a);
[InlineArray(4)] struct Buf { int _e; }          // C# 12: массив фиксированного размера в структуре
~~~

## Семантика {#semantics}

- Массив — ссылочный тип: `b = a` копирует ссылку, а не данные. Длина задаётся при создании и не меняется; `Array.Resize` **создаёт новый массив** и копирует.
- Элементы инициализируются значениями по умолчанию ([см.](#/ref/b/ty-defaults)): для ссылочных типов — `null`.
- Многомерный `T[,]` — один блок памяти, обход быстрый, но медленнее одномерного (нет оптимизаций JIT). Зубчатый `T[][]` — массив ссылок на массивы, строки могут иметь разную длину; обычно быстрее и гибче.
- Каждое обращение проверяет границы; JIT убирает проверку, если доказывает безопасность (например, `for (i = 0; i < a.Length; i++)`).
- **Ковариантность массивов:** `object[] o = new string[1];` допустима, но запись `o[0] = 1;` выбросит `ArrayTypeMismatchException` — проверка типа при записи.
- `foreach` по массиву не аллоцирует; `Length` — `int` (до 2³¹−1 элементов; для больше — `LongLength`).
- `[InlineArray(N)]` (C# 12, .NET 8) делает структуру из `N` последовательных элементов с доступом как к `Span<T>`; удобен для буферов без кучи.
- `params T[]` и коллекционные выражения `[…]` создают массивы неявно.

## Под капотом {#internals}

Объект массива: заголовок, указатель на таблицу методов, длина и элементы. Для значимых типов элементы лежат прямо в массиве (хорошая локальность кэша), для ссылочных — ссылки на объекты. Массивы больше ~85 000 байт попадают в Large Object Heap. Ковариантная запись выполняется командой `stelem.ref` с проверкой типа.

## Сложность {#complexity}

Индексация — `O(1)`. Поиск без сортировки — `O(n)`, бинарный поиск по отсортированному — `O(log n)`. Создание — `O(n)` (обнуление). `Resize` — `O(n)` по времени и памяти.

## Версии {#versions}

- C# 1.0 — массивы; C# 7.2 — `Span<T>` над массивами.
- C# 8 — индексы `^` и срезы; C# 12 — коллекционные выражения `[…]` и `InlineArray`.

## Ловушки {#pitfalls}

**Ковариантность и запись.**

~~~csharp
object[] objects = new string[2];
try { objects[0] = 42; }               // ❌ компилируется, падает в рантайме
catch (ArrayTypeMismatchException) { Console.WriteLine("ArrayTypeMismatchException"); }

int[] a = { 1, 2, 3 };
int[] alias = a;
alias[0] = 99;
Console.WriteLine(a[0]);               // 99: одна и та же память
int[] copy = (int[])a.Clone();
copy[0] = 0;
Console.WriteLine(a[0]);               // 99
~~~
~~~console
ArrayTypeMismatchException
99
99
~~~

**`new int[n][]` без инициализации строк** — элементы `null`.

**Рост массива в цикле.** Копирование при каждом `Resize` даёт `O(n²)`; используйте `List<T>`.

**Разница `Length` и `Rank`.** Для `int[,]` `Length` — общее число элементов.

## Примеры {#examples}

~~~csharp
int[,] grid = new int[2, 3];
grid[1, 2] = 7;
Console.WriteLine($"{grid.Length} {grid.GetLength(0)} {grid.GetLength(1)} {grid[1, 2]}");

int[][] jag = new int[3][];
for (int i = 0; i < jag.Length; i++) jag[i] = new int[i + 1];
Console.WriteLine(string.Join(",", jag.Select(r => r.Length)));

int[] a = { 5, 3, 8, 1 };
Array.Sort(a);
Console.WriteLine(string.Join(",", a));
Console.WriteLine(Array.BinarySearch(a, 5));
Array.Resize(ref a, 6);
Console.WriteLine(a.Length + " " + a[5]);

var buf = new Buf4();
buf[2] = 9;
Console.WriteLine(buf[2]);

[System.Runtime.CompilerServices.InlineArray(4)]
struct Buf4 { private int _e; }
~~~
~~~console
6 2 3 7
1,2,3
1,3,5,8
2
6 0
9
~~~

@@ref id="ty-dynamic-object" cat="B" title="object и dynamic" cs="4.0" cx="O(1)" mem="O(1)" danger="1" tags="object dynamic DLR RuntimeBinderException позднее связывание ExpandoObject базовый тип System.Object GetType ToString Equals" topic="p1-types,p1-boxing" related="ty-boxing,op-is-as,op-conversions" learn="?dotnet/csharp/language-reference/builtin-types/reference-types::object и dynamic"
`object` — базовый тип всех типов .NET; `dynamic` — тип, для которого проверка членов откладывается с компиляции на время выполнения.

## Синтаксис {#syntax}

~~~csharp @nocheck
object o = 42;   o = "text";   o = new List<int>();
string s = o.ToString();   Type t = o.GetType();   bool e = o.Equals(x);
dynamic d = 1;   d = "строка";   d.Foo(1, 2);      // разрешается при выполнении
var exp = new ExpandoObject() as dynamic;  exp.Name = "x";
~~~

## Семантика {#semantics}

- У `object` четыре публичных метода: `ToString`, `Equals`, `GetHashCode`, `GetType` (плюс защищённые `MemberwiseClone`, `Finalize`). Любой тип, включая структуры и `enum`, к нему приводится — значения при этом [упаковываются](#/ref/b/ty-boxing).
- Через `object` можно хранить что угодно, но использовать значение придётся после приведения (`is`, `as`, `(T)`).
- `dynamic` — это статически `object` с особой пометкой: любое обращение (`d.Foo()`, `d + 1`, `d[0]`) компилируется в вызов DLR (Dynamic Language Runtime), который во время выполнения ищет подходящий член и кэширует решение. Нет подсказок IDE и проверок компилятора.
- При отсутствии члена выбрасывается `RuntimeBinderException`.
- Результат выражения с `dynamic` почти всегда тоже `dynamic`; перегрузки выбираются по фактическому типу аргумента.
- `dynamic` нельзя использовать как тип ограничения и в `typeof(dynamic)`; в метаданных это `object` с атрибутом `[Dynamic]`.
- Применение: COM-интероп, работа с динамическими данными (JSON без схемы, `ExpandoObject`), редкие обходы системы типов.
- Тип выражения `dynamic` определяется во время выполнения, поэтому `var x = d.Foo();` тоже даёт `dynamic`, а присваивание `int n = d.Foo();` вставляет приведение, которое может упасть.
- В обычном коде вместо `dynamic` — обобщения, интерфейсы или `JsonElement`.

## Под капотом {#internals}

Для каждой операции с `dynamic` компилятор создаёт «call site» с кэшем правил. Первый вызов тяжёлый (разбор выражения, компиляция дерева выражений), последующие с тем же типом аргументов быстрее, но всё равно существенно медленнее обычного вызова. Сборка требует `Microsoft.CSharp`.

## Сложность {#complexity}

Первый вызов — миллисекунды, повторные — десятки наносекунд; для `object` — `O(1)` и, если нужна упаковка, аллокация.

## Версии {#versions}

- C# 1.0 — `object`; C# 4.0 — `dynamic`, DLR.
- C# 7 — шаблоны упрощают работу с `object` (`o is int i`).

## Ловушки {#pitfalls}

**Ошибка вместо подсказки компилятора.**

~~~csharp
dynamic d = "text";
Console.WriteLine(d.Length);               // 4: работает
try { Console.WriteLine(d.Count); }        // ❌ компилируется, падает при запуске
catch (Microsoft.CSharp.RuntimeBinder.RuntimeBinderException) { Console.WriteLine("RuntimeBinderException"); }

object o = "text";
Console.WriteLine(o is string s ? s.Length : -1);   // ✅ статическая проверка
~~~
~~~console
4
RuntimeBinderException
4
~~~

**Распространение `dynamic`.** Одно динамическое выражение «заражает» всю цепочку, ошибки накапливаются.

**Производительность в циклах.** Тысячи динамических вызовов в горячем пути — десятки миллисекунд.

**Сравнение `object == object`** — ссылки, а не значения ([сравнение](#/ref/a/op-comparison)).

## Примеры {#examples}

~~~csharp
object[] items = { 1, "два", 3.0, null! };
foreach (var x in items) Console.WriteLine(x?.GetType().Name ?? "null");

dynamic d = 5;
Console.WriteLine(d + 1);
d = "строка";
Console.WriteLine(d.ToUpper());

dynamic exp = new System.Dynamic.ExpandoObject();
exp.Name = "Аня";
exp.Age = 20;
Console.WriteLine($"{exp.Name} {exp.Age}");
~~~
~~~console
Int32
String
Double
null
6
СТРОКА
Аня 20
~~~

@@ref id="ty-boxing" cat="B" title="Упаковка и распаковка (boxing/unboxing)" cs="1.0" cx="O(1)" mem="O(n)" danger="1" tags="boxing unboxing упаковка распаковка object значимый тип box аллокация ArrayList интерфейс IComparable GC давление" topic="p1-boxing,p1-types" related="ty-struct,ty-dynamic-object,ty-generics,op-conversions" learn="dotnet/csharp/programming-guide/types/boxing-and-unboxing::Упаковка и распаковка"
Упаковка копирует значимый тип в новый объект в куче, чтобы ссылку на него можно было хранить как `object` или как интерфейс; распаковка — обратное копирование.

## Синтаксис {#syntax}

~~~csharp @nocheck
int i = 42;
object o = i;           // упаковка (box)
int j = (int)o;         // распаковка (unbox): точный тип
IComparable c = i;      // упаковка при приведении к интерфейсу
string s = $"{i}";      // может упаковывать аргумент (в старых компиляторах)
~~~

## Семантика {#semantics}

- Упаковка выделяет объект-коробку (заголовок + копия значения). Коробка независима от исходной переменной: изменение `i` после упаковки не меняет `o`.
- Распаковка возможна только в **точный** исходный тип (или `Nullable` от него): `(long)o` для упакованного `int` — `InvalidCastException`.
- Упаковка происходит при: присваивании структуры типу `object`, `ValueType`, `Enum` или интерфейсу; вызове необобщённых API (`ArrayList`, `string.Format(object)`); вызове виртуального метода, не переопределённого структурой (`ToString` без override — вызывается через коробку).
- Не происходит упаковки при использовании обобщений (`List<int>`, `IEquatable<T>` с ограничением `where T : IEquatable<T>`), при `ref`-передаче.
- Равенство: `object.ReferenceEquals(box1, box2)` ложно, даже если значения равны; `Equals` сравнивает значения.
- Изменяемые структуры, упакованные в интерфейс, меняются «внутри коробки» через методы интерфейса — источник неожиданных эффектов.
- Современные компиляторы и JIT .NET 9–10 могут распределять неутекающие коробки на стеке (escape analysis), но полагаться на это нельзя.

## Под капотом {#internals}

IL: `box <тип>` создаёт объект в куче и копирует значение, `unbox.any <тип>` проверяет таблицу методов коробки и копирует значение обратно. Размер коробки на 64-битной платформе — 16 байт заголовка + размер значения с выравниванием (для `int` — 24 байта).

## Сложность {#complexity}

Каждая упаковка — `O(размер)` и аллокация; в цикле на миллионы итераций это давление на GC (поколение 0). Распаковка — проверка типа плюс копирование.

## Версии {#versions}

- C# 1.0 — упаковка как единственный способ хранения значений в `object`.
- C# 2.0 — обобщения устранили основную причину упаковки.
- C# 10 — интерполированные строки через обработчики без упаковки; .NET 10 — stack allocation для части коробок.

## Ловушки {#pitfalls}

**Распаковка в «соседний» тип и копия.**

~~~csharp
int i = 5;
object o = i;
i = 6;
Console.WriteLine(o);                 // 5: коробка — копия
try { long l = (long)o; }             // ❌ точный тип — int
catch (InvalidCastException) { Console.WriteLine("InvalidCast"); }
long ok = (long)(int)o;               // ✅
Console.WriteLine(ok);
Console.WriteLine(ReferenceEquals(o, (object)i));   // False: каждая упаковка — новый объект
~~~
~~~console
5
InvalidCast
5
False
~~~

**Необобщённые коллекции** (`ArrayList`, `Hashtable`) упаковывают всё; используйте `List<T>`.

**Неявная упаковка в `string.Format` и `Console.WriteLine("{0}", x)`.**

**Структура, упакованная в интерфейс, изменяется иначе.** Не делайте структуры изменяемыми.

## Примеры {#examples}

~~~csharp
object[] boxes = new object[3];
for (int i = 0; i < boxes.Length; i++) boxes[i] = i * 10;
Console.WriteLine(string.Join(",", boxes));

object o = 3.5;
Console.WriteLine(o is double d ? d * 2 : 0);

var s = new Counter();
IIncrement boxed = s;
boxed.Inc(); boxed.Inc();
Console.WriteLine($"{s.N} {((Counter)boxed).N}");   // 0 2

interface IIncrement { void Inc(); }
struct Counter : IIncrement { public int N; public void Inc() => N++; }
~~~
~~~console
0,10,20
7
0 2
~~~

@@ref id="ty-variance" cat="B" title="Ковариантность и контравариантность (in/out)" cs="4.0" cx="O(1)" mem="O(1)" tags="ковариантность контравариантность variance in out IEnumerable Action Func IComparer инвариантность generic интерфейсы делегаты" topic="p2-generics" related="ty-generics,ty-arrays,op-lambda" learn="dotnet/standard/generics/covariance-and-contravariance::Ковариантность и контравариантность"
Вариантность говорит, можно ли использовать `G<Derived>` там, где ожидается `G<Base>` (ковариантность, `out`) или наоборот (контравариантность, `in`); без модификаторов обобщённые типы инвариантны.

## Синтаксис {#syntax}

~~~csharp @nocheck
interface IProducer<out T> { T Get(); }          // только возвращает T
interface IConsumer<in T> { void Put(T item); }  // только принимает T
delegate TResult Func<in T, out TResult>(T arg);
IEnumerable<object> objs = new List<string>();   // ковариантность
Action<string> a = (Action<object>)(o => { });   // контравариантность
~~~

## Семантика {#semantics}

- **Ковариантность `out T`:** `IEnumerable<string>` можно присвоить `IEnumerable<object>`: производитель строк — это и производитель объектов. `T` встречается только в позициях результата.
- **Контравариантность `in T`:** `Action<object>` можно присвоить `Action<string>`: потребитель любых объектов справится со строками. `T` встречается только во входных позициях.
- **Инвариантность:** `List<string>` нельзя присвоить `List<object>`, иначе в список строк можно было бы добавить число. Классы всегда инвариантны.
- Вариантность работает только для **ссылочных** аргументов типа (преобразование по ссылке): `IEnumerable<int>` не приводится к `IEnumerable<object>`.
- Правило запоминания: «out — отдаём наружу, in — принимаем внутрь»; тип, который и принимает, и отдаёт `T` (как `IList<T>`), остаётся инвариантным.
- Поддерживают вариантность интерфейсы и делегаты; встроенные примеры: `IEnumerable<out T>`, `IReadOnlyList<out T>`, `Func<in T, out TResult>`, `Action<in T>`, `IComparer<in T>`, `IEqualityComparer<in T>`.
- **Массивы ковариантны** с рождения, но небезопасно: проверка при записи переносится в рантайм ([массивы](#/ref/b/ty-arrays)).
- Вариантность распространяется на вложенные типы: `IEnumerable<IEnumerable<string>>` приводится к `IEnumerable<IEnumerable<object>>`.
- Свои интерфейсы объявляются с `in`/`out`; компилятор проверяет, что `T` используется корректно.

## Под капотом {#internals}

Вариантность — свойство метаданных (флаги параметров типа), CLR проверяет совместимость при приведении, но код вызовов не меняется: приведение по ссылке не создаёт нового объекта. Поэтому преобразования бесплатны.

## Сложность {#complexity}

`O(1)`: приведение ссылок без копирования; проверка типа при вызове интерфейсного метода — обычная.

## Версии {#versions}

- .NET 1.0 — ковариантность массивов; C# 4.0 / .NET 4.0 — вариантность интерфейсов и делегатов.
- .NET 4.5 — `IReadOnlyList<out T>`; C# 9 — ковариантные возвращаемые типы в переопределениях.

## Ловушки {#pitfalls}

**Ожидание вариантности у коллекций.**

~~~csharp @nocheck
List<object> objs = new List<string>();        // ❌ CS0029: List<T> инвариантен
IEnumerable<object> n = new List<int> { 1 };   // ❌ int — значимый тип, вариантности нет
~~~

Рабочие варианты:

~~~csharp
IEnumerable<object> seq = new List<string> { "a", "b" };   // ✅ ковариантность
Console.WriteLine(seq.Count());

Action<object> printAny = o => Console.WriteLine("объект: " + o);
Action<string> printStr = printAny;                          // ✅ контравариантность
printStr("строка");

IEnumerable<object> boxed = new List<int> { 1 }.Cast<object>();   // ✅ для int — явная упаковка
Console.WriteLine(boxed.First());
~~~
~~~console
2
объект: строка
1
~~~

**Нарушение позиции параметра.** Нельзя объявить `interface I<out T> { void Add(T x); }` — ошибка компиляции.

**Вариантность и перегрузки** создают неоднозначности при вызове с `null` и лямбдами.

## Примеры {#examples}

~~~csharp
IEnumerable<string> strings = new[] { "a", "b" };
IEnumerable<object> objects = strings;
Console.WriteLine(string.Join(",", objects));

Func<object, string> f = o => o.ToString()!;
Func<string, object> g = f;                      // и контр-, и ковариантность
Console.WriteLine(g("x"));

IComparer<object> cmp = Comparer<object>.Create((a, b) => a.ToString()!.CompareTo(b.ToString()));
IComparer<string> strCmp = cmp;
Console.WriteLine(strCmp.Compare("a", "b"));
~~~
~~~console
a,b
x
-1
~~~

@@ref id="ty-generics" cat="B" title="Обобщения и ограничения (generics, where)" cs="2.0" cx="O(1)" mem="O(1)" tags="generics обобщения where ограничения T struct class new() notnull unmanaged IComparable generic math static abstract default(T) typeof(T) закрытый тип открытый тип" topic="p2-generics" related="ty-variance,ty-boxing,op-default,op-typeof-sizeof,ty-dim" learn="dotnet/csharp/fundamentals/types/generics::Обобщения"
Обобщения позволяют писать тип или метод один раз для любого типа `T` с проверкой на этапе компиляции; ограничения `where` задают, что можно делать со значениями `T`.

## Синтаксис {#syntax}

~~~csharp @nocheck
class Box<T> { public T Value; }
T Max<T>(T a, T b) where T : IComparable<T> => a.CompareTo(b) > 0 ? a : b;
class Repo<T> where T : class, IEntity, new() { }
where T : struct              where T : class?       where T : notnull
where T : unmanaged           where T : Enum         where T : Base
where T : allows ref struct   // C# 13
static T Sum<T>(T a, T b) where T : INumber<T> => a + b;   // generic math (.NET 7)
~~~

## Семантика {#semantics}

- `Box<int>` и `Box<string>` — разные закрытые типы; `Box<>` — открытый (виден через `typeof(Box<>)`).
- Без ограничений доступны только члены `object`. Ограничения открывают возможности: `new()` — создание `new T()`, интерфейс — вызов его методов, `struct`/`class` — значимый/ссылочный тип, `unmanaged` — без ссылок (для указателей и `Span`), `notnull`, `Enum`, `Delegate`.
- Вывод типов: `Max(1, 2)` определит `T = int` по аргументам; по возвращаемому значению вывод не работает.
- `default(T)` — нулевое значение ([`default`](#/ref/a/op-default)); `typeof(T)` и `new T[]` допустимы.
- Нельзя: `new T(args)` (только `new()`), вызывать операторы `+` без интерфейсов обобщённой математики (`INumber<T>`, .NET 7), использовать статические члены `T` без `static abstract` в интерфейсе.
- **Статические поля** создаются отдельно для каждого закрытого типа: `Counter<int>.Count` и `Counter<string>.Count` не связаны.
- Для значимых типов JIT генерирует отдельный код под каждый `T` (без упаковки), для ссылочных — один общий код.
- Вариантность: см. [ковариантность и контравариантность](#/ref/b/ty-variance).

## Под капотом {#internals}

CLR хранит обобщённые типы «как есть» (reified): информация о `T` доступна в рантайме (в отличие от стирания типов в Java). Закрытые типы со значимыми аргументами получают собственную специализацию кода, со ссылочными — разделяемый код с передачей скрытого параметра с типом. Ограничение интерфейса для структуры вызывается без упаковки (`constrained.` префикс IL).

## Сложность {#complexity}

Вызовы — как у обычных методов. Для значимых типов нет упаковки, поэтому `List<int>` быстрее `ArrayList`. Каждая специализация значимого типа увеличивает размер кода в памяти.

## Версии {#versions}

- C# 2.0 / .NET 2.0 — обобщения; C# 7.3 — `unmanaged`, `Enum`, `Delegate`; C# 8 — `notnull`.
- C# 11 — обобщённая математика (`static abstract` в интерфейсах); C# 13 — `allows ref struct`.

## Ловушки {#pitfalls}

**Сравнение `T` без ограничения.**

~~~csharp
static bool IsDefault<T>(T value) => EqualityComparer<T>.Default.Equals(value, default!);   // ✅ без ограничений
Console.WriteLine(IsDefault(0));
Console.WriteLine(IsDefault("x"));
// static bool Bad<T>(T a, T b) => a > b;   // ❌ CS0019: для T нет оператора >
static T Max<T>(T a, T b) where T : IComparable<T> => a.CompareTo(b) >= 0 ? a : b;   // ✅ ограничение
Console.WriteLine(Max(3, 9));
~~~
~~~console
True
False
9
~~~

**Статика по типам.** Счётчик в `Box<T>` не общий для всех `T`.

**Рефлексия и `typeof(T)` в горячем коде** — медленнее обычных вызовов.

**Ограничения не наследуются автоматически** в производных обобщённых типах: их нужно повторять.

## Примеры {#examples}

~~~csharp
using System.Numerics;

Console.WriteLine(Counter<int>.Next());
Console.WriteLine(Counter<int>.Next());
Console.WriteLine(Counter<string>.Next());

static T Sum<T>(IEnumerable<T> items) where T : INumber<T>
{
    T total = T.Zero;
    foreach (var x in items) total += x;
    return total;
}
Console.WriteLine(Sum(new[] { 1, 2, 3 }));
Console.WriteLine(Sum(new[] { 1.5, 2.5 }));

T Create<T>() where T : new() => new T();
Console.WriteLine(Create<List<int>>().Count);

static class Counter<T> { private static int n; public static int Next() => ++n; }
~~~
~~~console
1
2
1
6
4
0
~~~

@@ref id="ty-dim" cat="B" title="Реализации интерфейсов по умолчанию (default interface members)" cs="8.0" cx="O(1)" mem="O(1)" tags="default interface methods DIM интерфейс с реализацией static abstract виртуальные члены ромбовидное наследование static члены интерфейса" topic="p1-interfaces" related="ty-generics,ty-struct,ty-boxing" learn="?dotnet/csharp/language-reference/proposals/csharp-8.0/default-interface-methods::Методы интерфейсов по умолчанию"
Начиная с C# 8, у члена интерфейса может быть тело: типы, реализующие интерфейс, получают его «бесплатно» и могут переопределить, а авторы библиотек добавляют члены без поломки существующих реализаций.

## Синтаксис {#syntax}

~~~csharp @nocheck
interface ILogger
{
    void Log(string msg);
    void Warn(string msg) => Log("WARN: " + msg);      // реализация по умолчанию
    static ILogger Null => new NullLogger();             // статический член
    protected void Helper() { }                          // модификаторы доступа
}
class ConsoleLogger : ILogger { public void Log(string m) => Console.WriteLine(m); }
ILogger l = new ConsoleLogger();   l.Warn("x");
~~~

## Семантика {#semantics}

- Члены с телом — `virtual` по умолчанию; класс может переопределить их (явной реализацией `void ILogger.Warn(...)` или публичным методом).
- Члены интерфейса **не наследуются как члены класса**: `var c = new ConsoleLogger(); c.Warn("x");` не скомпилируется. Вызывать нужно через переменную интерфейсного типа.
- Если несколько интерфейсов задают реализацию одного и того же члена, класс обязан явно разрешить неоднозначность (проблема ромба).
- Разрешены `static` члены, поля `static`, вложенные типы, модификаторы `private`, `protected`, `internal`, `sealed`; **поля экземпляра** — нет.
- Статические абстрактные и виртуальные члены (C# 11) — основа обобщённой математики: `static abstract T operator +(T a, T b);`.
- Вызов `base(IFoo).M()` из класса не поддерживается; из другого интерфейса — можно.
- Для структур вызов реализации по умолчанию через интерфейс упаковывает значение.
- Реализация по умолчанию удобна для необязательного поведения (например, `Warn` поверх `Log`), но обязательные члены лучше оставлять абстрактными.
- Не злоупотребляйте: интерфейс с поведением превращается в «множественное наследование», усложняя читаемость.

## Под капотом {#internals}

Реализации по умолчанию — это виртуальные методы интерфейса; CLR разрешает их при диспетчеризации интерфейсного вызова: сначала ищет реализацию в классе, потом наиболее конкретную в интерфейсах. Это требует поддержки рантайма (.NET Core 3.0+, не .NET Framework).

## Сложность {#complexity}

Интерфейсный вызов `O(1)` через кэш диспетчеризации; чуть медленнее обычного виртуального вызова и не встраивается без devirtualization.

## Версии {#versions}

- C# 8 / .NET Core 3.0 — реализации по умолчанию; C# 11 / .NET 7 — `static abstract` и `static virtual`.
- Недоступно в .NET Framework и .NET Standard 2.0.

## Ловушки {#pitfalls}

**Вызов через класс.**

~~~csharp
ILogger l = new ConsoleLogger();
l.Warn("диск почти полон");                 // ✅ через интерфейс
var c = new ConsoleLogger();
// c.Warn("x");                             // ❌ CS1061: у класса нет такого члена
((ILogger)c).Warn("через приведение");      // ✅

interface ILogger { void Log(string m); void Warn(string m) => Log("WARN: " + m); }
class ConsoleLogger : ILogger { public void Log(string m) => Console.WriteLine(m); }
~~~
~~~console
WARN: диск почти полон
WARN: через приведение
~~~

**Ромб без разрешения.** Класс, получающий два разных `Warn` из двух интерфейсов, не компилируется.

**Изменение интерфейса в библиотеке** — благодаря DIM безопасно добавлять члены, но реализаторы могут «не заметить» новое поведение.

**Тестирование.** Моки для интерфейсов с DIM иногда вызывают реализацию по умолчанию, иногда нет — проверьте библиотеку.

## Примеры {#examples}

~~~csharp
ILogger a = new ConsoleLogger();
a.Warn("первый");
ILogger b = new LoudLogger();
b.Warn("второй");

interface ILogger
{
    void Log(string m);
    void Warn(string m) => Log("WARN: " + m);
}
class ConsoleLogger : ILogger { public void Log(string m) => Console.WriteLine(m); }
class LoudLogger : ILogger
{
    public void Log(string m) => Console.WriteLine(m.ToUpper());
    public void Warn(string m) => Log("!!! " + m);
}
~~~
~~~console
WARN: первый
!!! ВТОРОЙ
~~~
