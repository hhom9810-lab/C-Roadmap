@@ref id="op-pointers" cat="A" title="Указатели: *, &, -> и fixed (unsafe)" cs="1.0" cx="O(1)" mem="O(1)" danger="1" tags="unsafe указатель pointer * & -> fixed stackalloc AllowUnsafeBlocks арифметика указателей interop native" topic="p1-types" related="op-stackalloc,op-ref-out-in,op-typeof-sizeof" learn="?dotnet/csharp/language-reference/unsafe-code::Небезопасный код и указатели"
В `unsafe`-контексте C# разрешает работать с адресами памяти напрямую: `&x` берёт адрес, `*p` разыменовывает, `p->field` обращается к полю структуры по указателю, а `fixed` закрепляет управляемый объект на время работы.

## Синтаксис {#syntax}

~~~csharp @nocheck
unsafe
{
    int x = 10;
    int* p = &x;            // адрес переменной
    *p = 20;                // запись по адресу
    int[] arr = { 1, 2, 3 };
    fixed (int* q = arr)    // закрепить массив в памяти
    {
        q[1] = 99;          // индексация указателя
        *(q + 2) = 7;       // арифметика указателя
    }
    P* sp = &structVar;  sp->X = 1;
}
~~~

## Семантика {#semantics}

- Нужен ключ компилятора `AllowUnsafeBlocks` и контекст `unsafe` (метод, блок или тип). Указатели не наследуют от `object`, не упаковываются и не поддерживают обобщения.
- Указатель допустим только на *неуправляемый* тип: числа, `bool`, `char`, `enum`, указатель, структуры без ссылочных полей.
- `&x` для управляемой переменной допустим, только если она «закреплена» (`fixed`) или это локальная переменная/параметр. Для поля объекта в куче — только внутри `fixed`.
- `p + n` сдвигает адрес на `n * sizeof(T)` байт. Вычитание двух указателей одного типа даёт число элементов между ними (`long`).
- Типы `void*` и `byte*` позволяют работать с «сырыми» буферами; разыменовать `void*` нельзя.
- GC может перемещать объекты в куче при уплотнении, поэтому `fixed` закрепляет объект, пока выполняется его блок.
- Выход за границы **не проверяется**: ошибка приведёт к порче памяти или аварийному завершению процесса.
- Современная альтернатива в большинстве случаев — `Span<T>` и `ref`-ссылки: безопасны по границам и почти так же быстры.

## Под капотом {#internals}

Указатель — это обычное машинное число-адрес. `fixed` порождает специальную `pinned`-локальную переменную, и JIT помечает объект как закреплённый для GC. Разыменование — инструкции `ldind`/`stind`. Проверка безопасности типов и границ при этом отсутствует, поэтому такой код не проходит верификацию (в современном .NET она уже не используется) и требует доверенной сборки.

## Сложность {#complexity}

Операции — `O(1)`, без накладных расходов на проверку границ. Закрепление при долгих `fixed` блоках мешает уплотнению кучи и фрагментирует её.

## Версии {#versions}

- C# 1.0 — `unsafe`, указатели, `fixed`, `stackalloc`.
- C# 7.3 — `fixed` по любому типу с методом `GetPinnableReference`; указатели на обобщённые неуправляемые типы.
- C# 9 — указатели на функции (`delegate*`).
- C# 11/12 — расширения для `ref`-полей и `scoped` уменьшают потребность в `unsafe`.

## Ловушки {#pitfalls}

**Использование указателя за пределами `fixed`.**

~~~csharp
unsafe
{
    int[] arr = { 1, 2, 3 };
    int* leaked;
    fixed (int* p = arr) { leaked = p; }     // ❌ после блока GC вправе переместить массив
    // *leaked — висячий указатель: поведение не определено
    fixed (int* p = arr) { p[0] = 100; }     // ✅ все обращения внутри блока
    Console.WriteLine(arr[0]);
}
~~~
~~~console
100
~~~

**Арифметика без проверки длины.** `p[10]` на массиве из трёх элементов не бросит исключение.

**Размер структуры** с выравниванием отличается от суммы полей; используйте `sizeof` и `StructLayout`.

**Платформы.** Размер `nint` и указателя зависит от разрядности процесса.

## Примеры {#examples}

~~~csharp
unsafe
{
    int x = 5;
    int* p = &x;
    *p += 10;
    Console.WriteLine(x);               // 15

    int[] data = { 1, 2, 3, 4 };
    fixed (int* start = data)
    {
        int* end = start + data.Length;
        int sum = 0;
        for (int* q = start; q < end; q++) sum += *q;
        Console.WriteLine(sum);         // 10
    }

    var pt = new Pt { X = 1, Y = 2 };
    Pt* pp = &pt;
    pp->X = 42;
    Console.WriteLine(pt.X);            // 42
}

struct Pt { public int X, Y; }
~~~
~~~console
15
10
42
~~~

@@ref id="op-overloading" cat="A" title="Перегрузка операторов" cs="1.0" cx="O(1)" mem="O(1)" tags="operator перегрузка операторов operator + == != < > true false implicit explicit checked IAdditionOperators generic math compound" topic="p1-encapsulation,p1-types" related="op-conversions,op-comparison,op-arithmetic,op-incdec,op-assignment" learn="dotnet/csharp/language-reference/operators/operator-overloading::Перегрузка операторов"
Перегрузка операторов позволяет своему типу участвовать в выражениях вроде `a + b`, `a == b` или `-a`: вы объявляете `public static` метод с ключевым словом `operator`, и компилятор подставляет его вместо встроенной операции.

## Синтаксис {#syntax}

~~~csharp @nocheck
public static Money operator +(Money a, Money b) => new(a.Amount + b.Amount);
public static Money operator -(Money a) => new(-a.Amount);          // унарный
public static bool operator ==(Money a, Money b) => a.Amount == b.Amount;
public static bool operator !=(Money a, Money b) => !(a == b);
public static Money operator ++(Money a) => new(a.Amount + 1);
public static implicit operator decimal(Money m) => m.Amount;       // преобразование
public static Money operator checked +(Money a, Money b) => ...;    // C# 11
public void operator +=(Money other) { ... }                        // C# 14, экземплярный
~~~

## Семантика {#semantics}

- Оператор — всегда `public static` (кроме экземплярных составных операторов C# 14), и хотя бы один параметр должен иметь тип самого класса или структуры.
- Можно перегружать: унарные `+ - ! ~ ++ -- true false`, бинарные `+ - * / % & | ^ << >> >>>`, сравнения `== != < > <= >=`, а также преобразования `implicit`/`explicit`.
- Нельзя перегружать: `=`, `&&`, `||`, `??`, `?:`, `.`, `new`, `is`, `as`, `typeof`, `sizeof`, `->` и индексатор `[]` (для него есть синтаксис индексаторов). `&&` и `||` работают через перегруженные `&`, `|`, `true`, `false`.
- Парные операторы объявляются вместе: `==` и `!=`, `<` и `>`, `<=` и `>=`, `true` и `false`; иначе — ошибка или предупреждение. При перегрузке `==` переопределите и `Equals`, и `GetHashCode`.
- Составное присваивание `+=` строится из перегрузки `+` автоматически (`a = a + b`). В C# 14 можно объявить экземплярный `operator +=`, который меняет объект на месте и не создаёт копию.
- `++`/`--` перегружаются одним методом для обеих форм (префикс и постфикс); он должен возвращать новый объект (для структуры) — компилятор сам различит значения.
- `operator checked +` (C# 11) задаёт поведение в `checked`-контексте, обычная версия — в `unchecked`.
- Сдвиги: правый операнд — `int`; с C# 11 — любой тип.
- Приоритет и ассоциативность задаются языком и **не меняются** перегрузкой.

## Под капотом {#internals}

Оператор — обычный статический метод со специальным именем (`op_Addition`, `op_Equality`, `op_Implicit`); выражение `a + b` компилируется в вызов `Money.op_Addition(a, b)`. JIT может встроить небольшие операторы. Для обобщённой математики (`INumber<T>`, `IAdditionOperators<,,>`) операторы объявляются как `static abstract` в интерфейсах.

## Сложность {#complexity}

Равна стоимости вызываемого метода: для небольших структур обычно `O(1)` без аллокаций, для классов, возвращающих новый объект, — выделение в куче на каждую операцию (отсюда рекомендации делать «числовые» типы структурами).

## Версии {#versions}

- C# 1.0 — перегрузка операторов.
- C# 11 — `static abstract` в интерфейсах, `operator checked`, `>>>`, любой тип правого операнда в сдвигах.
- C# 14 — экземплярные составные операторы присваивания и инкремента.

## Ловушки {#pitfalls}

**Перегрузили `==`, но не `Equals`/`GetHashCode`.**

~~~csharp
var a = new Tag("x");
var b = new Tag("x");
Console.WriteLine(a == b);                       // True — наш оператор
Console.WriteLine(a.Equals(b));                  // ❌ False — Equals остался ссылочным
var set = new HashSet<Tag> { a };
Console.WriteLine(set.Contains(b));              // ❌ False: словари используют GetHashCode/Equals

class Tag
{
    public string Name { get; }
    public Tag(string name) => Name = name;
    public static bool operator ==(Tag? l, Tag? r) => l?.Name == r?.Name;
    public static bool operator !=(Tag? l, Tag? r) => !(l == r);
}
~~~
~~~console
True
False
False
~~~

**Неочевидная семантика.** Оператор `+` для «склеивания» неоднородных объектов запутывает читателя; перегружайте, только когда значение интуитивно.

**`null` в `==`.** Внутри перегруженного `==` обращение `l.Name` при `null` упадёт; проверяйте через `is null` или `ReferenceEquals`.

**Бесконечная рекурсия.** `a == b` внутри `operator ==` вызывает сам оператор; используйте `ReferenceEquals(a, null)`.

## Примеры {#examples}

~~~csharp
var a = new Money(5, "RUB");
var b = new Money(7, "RUB");
Console.WriteLine((a + b).ToString());    // 12 RUB
Console.WriteLine($"{-a}");               // -5 RUB
Console.WriteLine(a + b);                 // ❗ выбран WriteLine(decimal) из-за implicit: «12»
Console.WriteLine(a < b);                 // True
decimal d = a;                            // неявное преобразование
Console.WriteLine(d);                     // 5

readonly record struct Money(decimal Amount, string Currency)
{
    public static Money operator +(Money x, Money y) =>
        x.Currency == y.Currency ? new(x.Amount + y.Amount, x.Currency) : throw new InvalidOperationException("разные валюты");
    public static Money operator -(Money x) => new(-x.Amount, x.Currency);
    public static bool operator <(Money x, Money y) => x.Amount < y.Amount;
    public static bool operator >(Money x, Money y) => x.Amount > y.Amount;
    public static implicit operator decimal(Money m) => m.Amount;
    public override string ToString() => $"{Amount} {Currency}";
}
~~~
~~~console
12 RUB
-5 RUB
12
True
5
~~~

@@ref id="op-conversions" cat="A" title="Приведения и пользовательские преобразования" cs="1.0" cx="O(1)" mem="O(1)" danger="1" tags="приведение cast implicit explicit преобразование типов checked unchecked boxing unboxing числовое повышение Parse Convert" topic="p1-types,p1-boxing" related="op-overloading,op-is-as,op-arithmetic,op-overflow" learn="dotnet/csharp/language-reference/builtin-types/numeric-conversions::Встроенные числовые преобразования"
Преобразование типов бывает неявным (компилятор делает его сам, потерь нет) и явным (требует `(T)x` и может потерять данные или бросить исключение); свои преобразования задают операторами `implicit` и `explicit`.

## Синтаксис {#syntax}

~~~csharp @nocheck
long l = intValue;                      // неявное: расширение
int i = (int)longValue;                 // явное: возможна потеря
double d = (double)a / b;               // приведение до деления
object o = 5;  int n = (int)o;          // упаковка/распаковка
var s = (string)obj;                    // ссылочное приведение
public static implicit operator Celsius(double v) => new(v);
public static explicit operator int(Celsius c) => (int)c.Value;
~~~

## Семантика {#semantics}

- **Неявные числовые преобразования** идут «вверх» без потерь: `int → long → float/double/decimal` (но `long → float` допустим неявно с потерей точности), `byte → short → int`. `double → decimal` и обратно — только явно.
- **Явные** преобразования нужны, если возможна потеря: `double → int` отбрасывает дробную часть (усечение к нулю), а не округляет. Для округления — `Math.Round`.
- Явное числовое преобразование при переполнении **молча обрезает** в `unchecked` и бросает `OverflowException` в `checked` (см. [переполнение](#/ref/a/op-overflow)). Для `double → int` с `NaN` или значением вне диапазона результат определяется платформой, поэтому проверяйте диапазон.
- **Упаковка/распаковка.** `object o = 5` упаковывает; `(int)o` распаковывает только точный тип: `(long)o` для упакованного `int` бросит `InvalidCastException`.
- **Ссылочные**: приведение вверх по иерархии неявное, вниз — явное и проверяется во время выполнения; для безопасной проверки есть [`is`/`as`](#/ref/a/op-is-as).
- **Пользовательские**: `implicit` не должен терять данные и бросать исключения, `explicit` — может. Объявляются в одном из двух типов. Нельзя объявить преобразование к базовому/интерфейсу и от них.
- Компилятор применяет не более **одного** пользовательского преобразования в цепочке (плюс стандартные до и после).
- `checked` версия: `public static explicit operator checked int(...)` (C# 11).
- Разбор строк: `int.Parse`/`TryParse`, а не приведение.

## Под капотом {#internals}

Числовые преобразования — IL-инструкции `conv.*` (и `conv.ovf.*` в `checked`). Приведение ссылки — `castclass`, упаковка — `box`, распаковка — `unbox.any`. Пользовательские преобразования — обычные статические методы `op_Implicit` и `op_Explicit`.

## Сложность {#complexity}

Числовые — одна инструкция процессора. Упаковка — аллокация в куче и копирование. Пользовательские — стоимость метода.

## Версии {#versions}

- C# 1.0 — базовые преобразования.
- C# 2.0 — `Nullable<T>` и «поднятые» преобразования.
- C# 11 — `checked`-версии пользовательских явных операторов.
- C# 12 — преобразование коллекционных выражений к типам коллекций.

## Ловушки {#pitfalls}

**Деление после приведения не туда.**

~~~csharp
int a = 7, b = 2;
Console.WriteLine((double)(a / b));      // ❌ 3: сначала целочисленное деление
Console.WriteLine((double)a / b);        // ✅ 3.5

object boxed = 5;
try { Console.WriteLine((long)boxed); }  // ❌ распаковка только в точный тип
catch (InvalidCastException) { Console.WriteLine("InvalidCast"); }
Console.WriteLine((long)(int)boxed);     // ✅ 5
~~~
~~~console
3
3.5
InvalidCast
5
~~~

**Усечение вместо округления.** `(int)2.9` равно `2`, `(int)-2.9` равно `-2`.

**Неявное преобразование с потерями.** `long → float` допустимо без приведения, но теряет точность; целое 16 777 217 при записи в `float` превращается в 16 777 216.

**Слишком «умные» `implicit` операторы** скрывают дорогие действия и неожиданные перегрузки; делайте явными всё, что может потерять данные.

## Примеры {#examples}

~~~csharp
Console.WriteLine((int)3.99);                     // 3
Console.WriteLine((int)-3.99);                    // -3
Console.WriteLine(Math.Round(3.5));               // 4
int big = 300;
Console.WriteLine((byte)big);                     // 44: обрезка в unchecked
try { Console.WriteLine(checked((byte)big)); }
catch (OverflowException) { Console.WriteLine("OverflowException"); }
Console.WriteLine((char)('a' + 1));               // b
Console.WriteLine((int)'A');                      // 65

Celsius c = 100;                                  // неявное
Fahrenheit f = (Fahrenheit)c;                     // явное
Console.WriteLine(f);

readonly record struct Celsius(double Value)
{
    public static implicit operator Celsius(double v) => new(v);
}
readonly record struct Fahrenheit(double Value)
{
    public static explicit operator Fahrenheit(Celsius c) => new(c.Value * 9 / 5 + 32);
}
~~~
~~~console
3
-3
4
44
OverflowException
b
65
Fahrenheit { Value = 212 }
~~~

@@ref id="op-eval-order" cat="A" title="Порядок вычисления операндов" cs="1.0" cx="O(1)" mem="O(1)" danger="1" tags="порядок вычисления операндов слева направо побочные эффекты приоритет ассоциативность i++ индексатор аргументы" topic="p1-syntax" related="op-precedence,op-logical,op-assignment,op-incdec" learn="?dotnet/csharp/language-reference/language-specification/expressions::Порядок вычисления в выражениях"
Приоритет операторов определяет, как скобки расставятся в выражении, но не порядок вычисления: в C# операнды и аргументы вычисляются строго слева направо, поэтому побочные эффекты предсказуемы (в отличие от C и C++).

## Синтаксис {#syntax}

~~~csharp @nocheck
F() + G() * H()        // вызовы: F, G, H — именно в таком порядке
a[i++] = i;            // сначала индекс i++, потом правая часть
x = x++ + ++x;         // определено строго слева направо
Foo(A(), B(), C());    // аргументы: A, B, C
~~~

## Семантика {#semantics}

- **Приоритет ≠ порядок.** В `F() + G() * H()` умножение выполнится раньше сложения, но вызовы идут `F`, `G`, `H`.
- Операнды бинарного оператора вычисляются слева направо; затем применяется операция.
- Аргументы метода вычисляются слева направо в порядке записи, а не в порядке параметров (при именованных аргументах — тоже в порядке записи).
- В присваивании `a[i] = expr` сначала вычисляются `a` и `i`, потом `expr`, потом происходит запись. Для составного `a[i] += expr` — `a`, `i`, чтение `a[i]`, `expr`, запись.
- Короткое замыкание `&&`, `||`, `??`, `?.`, `?:` пропускает вычисление правой части ([логические операторы](#/ref/a/op-logical)).
- Инициализаторы объектов и коллекций выполняются по порядку записи, после конструктора.
- Для выражения `x = x++` результат — исходное значение `x` (постфиксный инкремент возвращает старое значение, потом оно перезаписывается).
- Операнды `checked`-арифметики и тернарного оператора подчиняются тем же правилам.
- Если важна последовательность действий, выносите вызовы в отдельные строки с промежуточными переменными: `var first = Next(); var second = Next();`.
- Порядок вычисления **определён языком**, но читаемость страдает: выражения с несколькими побочными эффектами лучше разбивать.

## Под капотом {#internals}

Компилятор выдаёт IL в порядке чтения выражения слева направо, сохраняя промежуточные значения на стеке вычислений или во временных локальных переменных. Оптимизации JIT не вправе изменить наблюдаемое поведение побочных эффектов.

## Сложность {#complexity}

Не влияет на асимптотику; важно только для корректности.

## Версии {#versions}

- C# 1.0 — порядок слева направо закреплён в спецификации и не менялся.
- C# 4.0 — именованные аргументы: порядок вычисления остаётся порядком записи, а не порядком параметров.

## Ловушки {#pitfalls}

**Побочные эффекты в одном выражении.**

~~~csharp
int i = 1;
int r = i++ + i++;          // ❌ читается неоднозначно, но определено: 1 + 2
Console.WriteLine($"{r} {i}");

int[] a = new int[4];
int k = 0;
a[k++] = k;                 // индекс 0 вычислен до k++, значение — уже 1
Console.WriteLine(string.Join(",", a));
~~~
~~~console
3 3
1,0,0,0
~~~

**Привычка из C/C++.** Там порядок не определён; в C# вы можете на него полагаться, но не должны злоупотреблять.

**Разные побочные эффекты в аргументах.** `Log(Next(), Next())` зависит от порядка — нечитаемо.

**Исключения.** Если левый операнд бросит исключение, правый не вычисляется, а уже выполненные побочные эффекты не откатываются.

**Порядок в инициализаторах и деконструкции.** При `(a, b) = (F(), G())` правая часть вычисляется целиком до присваивания, слева направо.

## Примеры {#examples}

~~~csharp
static int T(string name, int v) { Console.Write(name + " "); return v; }

int r = T("a", 1) + T("b", 2) * T("c", 3);
Console.WriteLine($"= {r}");                         // вызовы a b c, умножение раньше сложения

int x = 5;
x = x++;
Console.WriteLine(x);                                // 5

Console.WriteLine(T("l", 0) > 0 && T("r", 1) > 0);   // правая часть пропущена
~~~
~~~console
a b c = 7
5
l False
~~~

@@ref id="op-precedence" cat="A" title="Приоритет и ассоциативность операторов" cs="1.0" cx="O(1)" mem="O(1)" table="1" tags="приоритет ассоциативность таблица операторов precedence associativity скобки порядок операций" topic="p1-syntax" related="op-eval-order,op-logical,op-bitwise,op-ternary,op-null-coalescing" learn="?dotnet/csharp/language-reference/operators/::Операторы C# и приоритет"
Приоритет определяет, какие операторы связываются с операндами раньше, а ассоциативность — в каком порядке выполняются операторы одного приоритета; таблица ниже отсортирована от высшего приоритета к низшему.

## Синтаксис {#syntax}

~~~csharp @nocheck
a + b * c            // b * c раньше: * выше +
a - b - c            // (a - b) - c: левая ассоциативность
a = b = c            // a = (b = c): правая ассоциативность
x ?? y ?? z          // x ?? (y ?? z)
c1 ? a : c2 ? b : d  // c1 ? a : (c2 ? b : d)
~~~

## Семантика {#semantics}

:::sortable Таблица приоритета операторов C#

| № | Категория | Операторы | Ассоциативность |
|---|---|---|---|
| 1 | Первичные | `x.y` `f(x)` `a[i]` `x?.y` `x?[y]` `x++` `x--` `x!` `new` `typeof` `sizeof` `checked` `unchecked` `default` `nameof` `delegate` `stackalloc` `x->y` | слева направо |
| 2 | Унарные | `+x` `-x` `!x` `~x` `++x` `--x` `^x` `(T)x` `await` `&x` `*x` | справа налево |
| 3 | Диапазон | `x..y` | слева направо |
| 4 | switch и with | `switch` `with` | слева направо |
| 5 | Мультипликативные | `*` `/` `%` | слева направо |
| 6 | Аддитивные | `+` `-` | слева направо |
| 7 | Сдвиг | `<<` `>>` `>>>` | слева направо |
| 8 | Отношения и типы | `<` `>` `<=` `>=` `is` `as` | слева направо |
| 9 | Равенство | `==` `!=` | слева направо |
| 10 | Логическое И | `&` | слева направо |
| 11 | Исключающее ИЛИ | `^` | слева направо |
| 12 | Логическое ИЛИ | `\|` | слева направо |
| 13 | Условное И | `&&` | слева направо |
| 14 | Условное ИЛИ | `\|\|` | слева направо |
| 15 | Объединение с null | `??` `??=` | справа налево |
| 16 | Условный оператор | `?:` | справа налево |
| 17 | Присваивание и лямбда | `=` `+=` `-=` `*=` `/=` `%=` `&=` `\|=` `^=` `<<=` `>>=` `>>>=` `=>` | справа налево |

:::

- Меньший номер — более высокий приоритет.
- Побитовые `&`, `^`, `|` слабее сравнений (в отличие от арифметики): `x & 1 == 0` читается как `x & (1 == 0)`. Всегда ставьте скобки.
- Унарные операторы и `?:`/`??`/присваивание правоассоциативны, остальные — левоассоциативны.
- `??` слабее `||`, но сильнее `?:`: `a ?? b ? c : d` читается как `(a ?? b) ? c : d`.
- Скобки изменяют порядок группировки, но не порядок вычисления операндов — см. [порядок вычисления](#/ref/a/op-eval-order).
- Приведение `(T)x` — унарный оператор: `(int)a + b` приводит `a`, а не сумму.
- Шаблонные комбинаторы `and`, `or`, `not` имеют собственные уровни приоритета внутри шаблонов: `not` > `and` > `or`.

## Под капотом {#internals}

Приоритет — свойство грамматики: парсер строит дерево разбора, в котором операторы более высокого приоритета оказываются ближе к листьям. На IL влияет только форма дерева; порядок вычисления определяется обходом дерева слева направо.

## Сложность {#complexity}

Не влияет на производительность: разбор выполняется при компиляции.

## Версии {#versions}

- C# 1.0 — основная таблица.
- C# 8 — оператор диапазона `..` и `^`; C# 8/9 — `switch` и `with` как выражения.
- C# 11 — `>>>`.

## Ловушки {#pitfalls}

**Побитовые и сравнения.**

~~~csharp
int x = 6;
// Console.WriteLine(x & 1 == 0);   // ❌ ошибка: int & bool (CS0019)
Console.WriteLine((x & 1) == 0);    // ✅ True: x чётное

bool a = true, b = false, c = false;
Console.WriteLine(a || b && c);     // True: && сильнее ||, это a || (b && c)
Console.WriteLine((a || b) && c);   // False: скобки меняют группировку
Console.WriteLine(1 + 2 << 3);      // 24: сложение сильнее сдвига
~~~
~~~console
True
True
False
24
~~~

**Ассоциативность присваивания и `?:`.** Цепочки читаются справа налево.

**Унарный минус и доступ к члену.** Доступ к члену сильнее унарного минуса: `-x.Foo` — это `-(x.Foo)`, а `-1.ToString()` не скомпилируется, потому что минус применяется к строке.

## Примеры {#examples}

~~~csharp
Console.WriteLine(2 + 3 * 4);          // 14
Console.WriteLine((2 + 3) * 4);        // 20
Console.WriteLine(10 - 4 - 3);         // 3: слева направо
Console.WriteLine(-2 * 3);             // -6
int a, b, c;
a = b = c = 4;                         // справа налево
Console.WriteLine(a + b + c);          // 12
string? s = null;
Console.WriteLine(s ?? "x" + "y");     // xy: + сильнее ??
Console.WriteLine(1 << 2 + 1);         // 8
~~~
~~~console
14
20
3
-6
12
xy
8
~~~
