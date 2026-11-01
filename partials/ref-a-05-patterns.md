@@ref id="op-patterns-basic" cat="A" title="Шаблоны: константа, тип, var, discard" cs="7.0" cx="O(1)" mem="O(1)" tags="pattern matching шаблоны constant type declaration var discard _ is switch null" topic="p1-types,p1-syntax" related="op-is-as,op-pattern-relational,op-pattern-property,op-switch-expression" learn="dotnet/csharp/language-reference/operators/patterns::Сопоставление с шаблоном"
Шаблон описывает форму значения: константу, тип или «что угодно»; его можно проверить оператором `is`, в `switch` и в `switch`-выражении, а совпавшие части сразу получают имя.

## Синтаксис {#syntax}

~~~csharp @nocheck
x is 42                    // константный шаблон (число, строка, null, enum, bool)
x is null                  // константа null
x is string                // шаблон типа (C# 9)
x is string s              // шаблон объявления
x is var v                 // var-шаблон: совпадает всегда, в том числе с null
x is _                     // шаблон-отбрасывание: совпадает всегда
~~~

## Семантика {#semantics}

- **Константный шаблон.** Значение сравнивается с константой; для `null` проверяется ссылка. Выражение-константа должно быть совместимо по типу.
- **Шаблон типа / объявления.** Совпадает, если значение не `null` и совместимо с типом. Объявленная переменная присваивается только при совпадении, а в `if` определённо присвоена внутри ветки `true`.
- **`var`-шаблон** совпадает с любым значением, **включая `null`**, и объявляет переменную выведенного типа. Нужен в основном внутри составных шаблонов: `(var x, var y)`.
- **Discard `_`.** Совпадает с чем угодно и ничего не объявляет. В `switch`-выражении `_` — ветка по умолчанию.
- Шаблоны можно комбинировать: [реляционные и логические](#/ref/a/op-pattern-relational), [свойств и позиционные](#/ref/a/op-pattern-property), [списков](#/ref/a/op-pattern-list).
- Шаблоны читаются лучше всего, когда каждая ветка описывает один случай; громоздкое условие в `when` удобнее вынести в именованный метод.
- Порядок веток важен: компилятор сообщит об ошибке, если ветка недостижима (CS8120 в операторе `switch`, CS8510 в выражении), а `switch`-выражение без `_` получит предупреждение о неполноте (CS8509).

## Под капотом {#internals}

Компилятор строит дерево решений: сначала проверка `null`, потом типов и констант, по возможности без повторных проверок; для многих целых констант генерирует `switch` IL или бинарный поиск, а для строк — вычисление хеша. Объявленные переменные — обычные локальные.

## Сложность {#complexity}

Для набора констант и типов — `O(1)` для целочисленных `switch` и `O(k)` по числу проверок типа; для строк используется хеш, так что в среднем `O(длина строки)`.

## Версии {#versions}

- C# 7.0 — константный шаблон, шаблон типа с объявлением, `var`; `switch` со `case ... when`.
- C# 8 — `switch`-выражение, шаблоны свойств, позиционные, кортежные.
- C# 9 — `is string` без имени, `not`, `and`, `or`, реляционные.
- C# 11 — шаблоны списков, шаблоны с `Span<char>` и константной строкой.

## Ловушки {#pitfalls}

**`var`-шаблон не проверяет на `null`.**

~~~csharp
string? text = null;
if (text is var t) Console.WriteLine("совпало, t == null");   // ❌ var совпадает всегда
if (text is string u) Console.WriteLine("не выполнится");     // ✅ тип-шаблон требует не-null
else Console.WriteLine("null не прошёл string-шаблон");
~~~
~~~console
совпало, t == null
null не прошёл string-шаблон
~~~

**Область видимости.** Переменная из `if (x is T t)` остаётся доступной после `if`, но определённо присвоена только в ветке успеха.

**Константа не того типа.** `obj is 1` истинно для `int` 1, но ложно для `long` 1: шаблон проверяет тип константы.

**Лишний `_` в конце, когда варианты исчерпаны** скрывает будущие недостающие ветки: компилятор не предупредит о новом элементе перечисления.

## Примеры {#examples}

~~~csharp
static string Describe(object? o) => o switch
{
    null => "null",
    0 => "ноль (int)",
    string { Length: 0 } => "пустая строка",
    string s => $"строка {s}",
    int i => $"int {i}",
    _ => "другое"
};

Console.WriteLine(Describe(null));
Console.WriteLine(Describe(0));
Console.WriteLine(Describe(0L));
Console.WriteLine(Describe(""));
Console.WriteLine(Describe("abc"));
Console.WriteLine(Describe(7));

if (Describe(3.5) is var d) Console.WriteLine(d);
~~~
~~~console
null
ноль (int)
другое
пустая строка
строка abc
int 7
другое
~~~

@@ref id="op-pattern-relational" cat="A" title="Шаблоны: реляционные и логические (<, and, or, not)" cs="9.0" cx="O(1)" mem="O(1)" tags="relational pattern and or not диапазон значений is > < >= <= скобки шаблон комбинаторы" topic="p1-syntax,p1-types" related="op-patterns-basic,op-pattern-property,op-logical,op-switch-expression" learn="dotnet/csharp/language-reference/operators/patterns::Реляционные и логические шаблоны"
Реляционные шаблоны (`< <= > >=`) сравнивают значение с константой, а `and`, `or`, `not` и скобки складывают из шаблонов условия вроде «от 1 до 9, но не 5» без повторения переменной.

## Синтаксис {#syntax}

~~~csharp @nocheck
x is > 0                     // реляционный
x is >= 1 and <= 9           // диапазон
c is >= 'a' and <= 'z' or >= 'A' and <= 'Z'
x is not null                // отрицание
x is not (1 or 2)            // отрицание группы
~~~

## Семантика {#semantics}

- Правый операнд реляционного шаблона — константа числового, `char`, `enum` типа; для строк `<`/`>` не поддерживаются.
- `and` сильнее `or`; `not` сильнее обоих. Скобки группируют: `not (1 or 2)`.
- `and`, `or`, `not` — это **комбинаторы шаблонов**, а не логические операторы: они стоят между шаблонами, а не между `bool`-выражениями. Выражение `x is > 1 && y is < 5` по-прежнему использует `&&`.
- Компилятор проверяет достижимость и полноту: `x is > 0 and < 0` — ошибка CS8518 (шаблон никогда не совпадёт), а в `switch`-выражении перекрывающиеся диапазоны сообщают о недостижимой ветке.
- Для `NaN` реляционные шаблоны ложны, `x is not > 0` для `NaN` — истина.
- `is not null` — рекомендуемая запись проверки на «не `null`» (не вызывает перегруженный `!=`).
- Комбинаторы можно вкладывать в шаблоны свойств: `{ Age: >= 18 and < 65 }`. Так условие остаётся рядом с тем, что проверяется, и не повторяет имя переменной.

## Под капотом {#internals}

Компилятор разворачивает комбинаторы в обычные сравнения и переходы, а для набора диапазонов в `switch`-выражении строит бинарный поиск по границам вместо цепочки `if`. Накладных расходов по сравнению с рукописными `if` нет.

## Сложность {#complexity}

Одиночное условие — `O(1)`; для `switch` по диапазонам — `O(log k)` при упорядоченных границах, иначе `O(k)`.

## Версии {#versions}

- C# 9 — реляционные шаблоны и комбинаторы `and`, `or`, `not`.
- C# 10 — расширенные шаблоны свойств (`{ A.B: 1 }`), см. [шаблоны свойств](#/ref/a/op-pattern-property).

## Ловушки {#pitfalls}

**`or` без повторения шаблона.**

~~~csharp
int day = 3;
Console.WriteLine(day is 6 or 7);          // ✅ True/False: «6 или 7»
// day is 6 or day is 7 — тоже работает, но избыточно
// day is 6 || 7 — ошибка компиляции: 7 не bool
Console.WriteLine(day is >= 1 and <= 5);   // True: будний день
~~~
~~~console
False
True
~~~

**Область применения.** Реляционные шаблоны работают только с константами: сравнить с другой переменной нельзя (`x is > limit` не компилируется), для этого нужен обычный оператор `x > limit`.

**`and` вместо `or` в диапазоне исключений.** `x is not 1 and not 2` значит «ни 1, ни 2», а `x is not 1 or 2` — «не 1, либо 2»: всегда истина для 2, а для остальных — тоже. Ставьте скобки.

**Путаница с `&&`.** `age is >= 18 && >= 21` не компилируется, нужно `age is >= 18 and >= 21`.

## Примеры {#examples}

~~~csharp
static string Grade(int score) => score switch
{
    < 0 or > 100 => "некорректно",   // узкие исключения — первыми
    >= 90 => "A",
    >= 75 => "B",
    >= 60 => "C",
    _ => "F"
};

foreach (var s in new[] { 95, 80, 60, 10, 120, -1 })
    Console.WriteLine($"{s}: {Grade(s)}");

static bool IsLetter(char c) => c is >= 'a' and <= 'z' or >= 'A' and <= 'Z';
Console.WriteLine(IsLetter('q'));
Console.WriteLine(IsLetter('5'));
Console.WriteLine(3 is not (1 or 2));
~~~
~~~console
95: A
80: B
60: C
10: F
120: некорректно
-1: некорректно
True
False
True
~~~

@@ref id="op-pattern-property" cat="A" title="Шаблоны: свойств, позиционные и кортежные" cs="8.0" cx="O(1)" mem="O(1)" tags="property pattern positional pattern Deconstruct tuple pattern { } вложенные свойства record switch" topic="p1-types,p1-methods" related="op-patterns-basic,op-pattern-relational,op-pattern-list,op-switch-expression" learn="dotnet/csharp/language-reference/operators/patterns::Шаблоны свойств и позиционные"
Шаблон свойств `{ Prop: pattern }` проверяет значения свойств объекта, позиционный `(a, b)` раскладывает объект через `Deconstruct`, а кортежный сопоставляет несколько значений сразу.

## Синтаксис {#syntax}

~~~csharp @nocheck
p is { Age: >= 18 }                 // шаблон свойств
p is { Address.City: "Омск" }       // расширенный (C# 10)
p is { Name: var n, Age: > 0 }      // с захватом переменной
pt is (0, 0)                        // позиционный: вызывает Deconstruct
pt is (var x, > 0)
(a, b) switch { (1, 1) => ..., _ => ... }   // кортежный
~~~

## Семантика {#semantics}

- `{ ... }` сначала проверяет, что объект не `null`, и лишь потом свойства. Пустой `{ }` — «не `null`».
- Свойства сопоставляются слева направо; вычисление останавливается на первом несовпадении. Геттеры вызываются реально, поэтому их побочные эффекты видны.
- Вложенные свойства (`A.B.C`) поддерживаются с C# 10 и эквивалентны вложенным `{ }`; при `A == null` совпадения нет.
- **Позиционный шаблон** требует метод `Deconstruct` (у `record` и кортежей он есть). Число элементов должно совпасть с числом `out`-параметров.
- **Кортежный шаблон** — частный случай: `switch` по `(x, y)` без создания реального кортежа — компилятор не выделяет память.
- К шаблону можно добавить имя и тип: `Circle { Radius: > 0 } c`.
- Для `record` и кортежей позиционный шаблон работает сразу; для своего класса добавьте `public void Deconstruct(out int x, out int y)`, и шаблон заработает так же.
- Если свойство возвращает значимый тип, шаблон сравнивает его без упаковки.
- `when` в `case` добавляет произвольное условие; в `switch`-выражении `when` тоже допустим.

## Под капотом {#internals}

Компилятор строит дерево проверок: `isinst`, чтение каждого свойства (по одному разу, результат кэшируется во временной переменной) и сравнения. `Deconstruct` вызывается один раз на объект. Кортежи в `switch` разбираются «на месте» без `ValueTuple`.

## Сложность {#complexity}

`O(k)` по числу проверяемых свойств; никаких аллокаций, кроме тех, что делают сами геттеры или `Deconstruct`.

## Версии {#versions}

- C# 8 — шаблоны свойств, позиционные, кортежные.
- C# 9 — комбинаторы `and`, `or`, `not` внутри свойств.
- C# 10 — расширенные шаблоны свойств `{ A.B: x }`.

## Ловушки {#pitfalls}

**Геттер с побочным эффектом или дорогой геттер** вызывается в шаблоне, возможно, несколько раз при разных ветках (компилятор пытается объединить вызовы, но гарантий нет).

**Пустая запись.** `if (x is { })` — «не `null`», а не «пустой объект».

**Ошибка в числе элементов.**

~~~csharp
var origin = new Point(0, 0);
Console.WriteLine(origin is (0, 0));      // ✅ True
// Console.WriteLine(origin is (0, 0, 0)); // ❌ CS8129: у Deconstruct два параметра
Console.WriteLine(origin is { X: 0, Y: > 0 });   // False: Y не больше 0

record Point(int X, int Y);
~~~
~~~console
True
False
~~~

**Свойство, которого нет у статического типа.** Имя в `{ }` ищется в типе выражения; для `object` предварительно проверьте тип: `o is string { Length: 0 }`.

## Примеры {#examples}

~~~csharp
static string Classify(Point p) => p switch
{
    (0, 0) => "начало координат",
    (var x, 0) => $"на оси X ({x})",
    (0, var y) => $"на оси Y ({y})",
    { X: > 0, Y: > 0 } => "первая четверть",
    _ => "прочее"
};

Console.WriteLine(Classify(new(0, 0)));
Console.WriteLine(Classify(new(5, 0)));
Console.WriteLine(Classify(new(0, -3)));
Console.WriteLine(Classify(new(2, 3)));
Console.WriteLine(Classify(new(-1, -1)));

static string Rps(string a, string b) => (a, b) switch
{
    ("камень", "ножницы") or ("ножницы", "бумага") or ("бумага", "камень") => "победа первого",
    var (x, y) when x == y => "ничья",
    _ => "победа второго"
};
Console.WriteLine(Rps("камень", "ножницы"));
Console.WriteLine(Rps("бумага", "бумага"));

record Point(int X, int Y);
~~~
~~~console
начало координат
на оси X (5)
на оси Y (-3)
первая четверть
прочее
победа первого
ничья
~~~

@@ref id="op-pattern-list" cat="A" title="Шаблоны списков и срезов ([..])" cs="11.0" cx="O(n)" mem="O(1)" tags="list pattern slice pattern [..] массив длина Count индексатор spread" topic="p1-types,p2-list" related="op-patterns-basic,op-pattern-property,op-range-index" learn="dotnet/csharp/language-reference/operators/patterns::Шаблоны списков"
Шаблон списка `[a, b, ..]` сопоставляет последовательность по элементам, а срез `..` захватывает любое количество элементов подряд.

## Синтаксис {#syntax}

~~~csharp @nocheck
arr is [1, 2, 3]            // ровно три элемента
arr is [1, ..]              // начинается с 1
arr is [.., 9]              // заканчивается на 9
arr is [var first, .., var last]
arr is [_, _]               // ровно два любых элемента
arr is [1, .. var rest]     // rest — срез остатка
arr is []                   // пусто
~~~

## Семантика {#semantics}

- Работает для типов, у которых есть доступное свойство `Length` или `Count` и индексатор по `int` (массивы, `List<T>`, `string`, `Span<T>`, `ImmutableArray<T>`). Для среза нужен ещё индексатор по `Range` или метод `Slice(int, int)`.
- В списке допустим **не более одного** среза `..`.
- Элементы — любые шаблоны: константы, [реляционные](#/ref/a/op-pattern-relational), [свойств](#/ref/a/op-pattern-property), вложенные списки.
- Срез с `var` создаёт **новую** подпоследовательность: для массива — копия, для `string` — подстрока, для `Span<T>` — представление без копии.
- Без среза проверяется длина (`Length == n`); со срезом — `Length >= число_элементов_вне_среза`.
- `IEnumerable<T>` без индексатора не поддерживается: сначала превратите в массив или список.
- Шаблон списка удобен для разбора коротких команд и аргументов: `args is ["add", var name]`. Для больших коллекций он не заменяет цикл — каждый такой шаблон описывает фиксированную форму.
- `[..]` совпадает с любой последовательностью, `[_, ..]` — с непустой, а `[var x]` — ровно с одним элементом.
- Для `Span<T>` и `ReadOnlySpan<T>` шаблон работает без выделения памяти, что удобно для разбора буферов.
- Строки сопоставляются посимвольно: `"abc" is ['a', .., 'c']` истинно.

## Под капотом {#internals}

Компилятор читает `Length`/`Count`, проверяет длину, потом читает элементы через индексатор, для хвостовых позиций — с индексами «с конца» (`^1`). Срез с захватом вызывает `Slice` или `RuntimeHelpers.GetSubArray` для массивов.

## Сложность {#complexity}

Проверка без захвата среза — `O(k)` по числу описанных элементов; захват среза массива или строки — `O(n)` по длине среза (копия), для `Span<T>` — `O(1)`.

## Версии {#versions}

- C# 11 / .NET 7 — шаблоны списков, срезы, `string`/`ReadOnlySpan<char>`.

## Ловушки {#pitfalls}

**Срез с `var` копирует массив.**

~~~csharp
int[] data = { 1, 2, 3, 4 };
if (data is [var head, .. var tail])
{
    tail[0] = 99;                       // ❌ меняем копию, а не data
    Console.WriteLine(head);
    Console.WriteLine(string.Join(",", data));   // 1,2,3,4 — исходный массив не изменился
}
~~~
~~~console
1
1,2,3,4
~~~

**Читаемость.** Шаблон с несколькими вложенными срезами быстро становится нечитаемым; выносите его в именованный метод или разбирайте последовательность циклом.

**`IEnumerable<T>`** не подходит: нет `Length` и индексатора.

**Несколько срезов** — ошибка компиляции.

**Порядок веток в `switch`.** Шаблон `[..]` совпадает с любой последовательностью — ставьте его после более узких.

## Примеры {#examples}

~~~csharp
static string Describe(int[] a) => a switch
{
    [] => "пусто",
    [var x] => $"один элемент {x}",
    [var first, .., var last] when first == last => $"границы равны ({first})",
    [1, 2, ..] => "начинается с 1, 2",
    [_, _, ..] => "два и больше",
};

Console.WriteLine(Describe(new int[] { }));
Console.WriteLine(Describe(new[] { 5 }));
Console.WriteLine(Describe(new[] { 7, 1, 7 }));
Console.WriteLine(Describe(new[] { 1, 2, 3 }));
Console.WriteLine(Describe(new[] { 4, 5 }));

string cmd = "move 10 20";
if (cmd.Split(' ') is ["move", var dx, var dy])
    Console.WriteLine($"сдвиг на {dx},{dy}");
~~~
~~~console
пусто
один элемент 5
границы равны (7)
начинается с 1, 2
два и больше
сдвиг на 10,20
~~~

@@ref id="op-switch-statement" cat="A" title="Оператор switch" cs="1.0" cx="O(1)" mem="O(1)" danger="1" tags="switch case break goto case default fall-through when guard шаблоны оператор ветвления" topic="p1-syntax" related="op-switch-expression,op-patterns-basic,op-ternary" learn="dotnet/csharp/language-reference/statements/selection-statements::Оператор switch"
Оператор `switch` выбирает один из блоков кода по значению выражения или по шаблону; в C# каждый блок обязан завершаться (`break`, `return`, `goto`, `throw`), «проваливания» между метками нет.

## Синтаксис {#syntax}

~~~csharp @nocheck
switch (expr)
{
    case 1:
    case 2:                         // несколько меток на один блок
        DoA(); break;
    case int n when n > 100:        // шаблон + условие
        DoB(n); break;
    case string { Length: 0 }:
        DoC(); return;
    default:
        DoD(); break;
}
~~~

## Семантика {#semantics}

- Выражение сравнивается с метками по порядку объявления **шаблонов** (константы, типы, свойства…); `default` может стоять где угодно, но проверяется последним.
- Каждый `case`-блок должен «не дойти до конца»: нет неявного fall-through, как в C. Для перехода на другую метку используйте `goto case 2;` или `goto default;`.
- Несколько меток подряд (`case 1: case 2:`) — это один общий блок.
- `when` добавляет произвольное условие; метки с шаблонами проверяются в порядке записи, и недостижимая ветка — ошибка (CS8120).
- Область видимости: переменные, объявленные в блоке без фигурных скобок, видны во всей секции `switch`; переменные шаблона видны только в своём блоке.
- Типы выражения: любые, если используются шаблоны; без них — целые, `char`, `bool`, `enum`, `string` (константные метки).
- Если ни одна метка не подошла и нет `default`, ничего не происходит; для `enum` компилятор не требует перечислить все значения (в отличие от `switch`-выражения).

## Под капотом {#internals}

Для плотных целых констант IL содержит инструкцию `switch` (таблицу переходов). Для разреженных — бинарный поиск или цепочка сравнений. Для строк компилятор вычисляет хеш и сравнивает группами (при 7 и более метках) либо идёт цепочкой `==`. Все эти преобразования прозрачны.

## Сложность {#complexity}

Таблица переходов — `O(1)`, бинарный поиск — `O(log k)`, строки — `O(длина строки)` плюс сравнение. Для `case` с шаблонами и `when` — до `O(k)`.

## Версии {#versions}

- C# 1.0 — `switch` по целым, `string`, `enum`.
- C# 7.0 — шаблоны и `when` в метках.
- C# 8 — парное `switch`-выражение ([отдельная запись](#/ref/a/op-switch-expression)).
- C# 9 — реляционные и логические шаблоны в метках.

## Ловушки {#pitfalls}

**Забытый `break` — это ошибка, а не провал.**

~~~csharp
int level = 2;
switch (level)
{
    case 1: Console.WriteLine("низкий"); break;
    case 2: Console.WriteLine("средний");
        // ❌ без goto/break: ошибка CS0163 («Control cannot fall through»)
        goto case 3;                          // ✅ явный переход
    case 3: Console.WriteLine("высокий"); break;
}
~~~
~~~console
средний
высокий
~~~

**Порядок меток.** `case int n:` до `case 5:` делает вторую метку недостижимой.

**`default` не обработает `null` для типов-шаблонов:** `case string s` не совпадёт с `null`, а `default` совпадёт.

**Поведение для перечислений.** Добавили значение в `enum` — старый `switch` без `default` молча его проигнорирует.

## Примеры {#examples}

~~~csharp
static string Kind(object? o)
{
    switch (o)
    {
        case null: return "null";
        case int i when i < 0: return "отрицательное";
        case int: return "int";
        case string { Length: 0 }: return "пустая строка";
        case string s: return "строка " + s;
        default: return "что-то ещё";
    }
}

foreach (object? o in new object?[] { null, -4, 4, "", "hi", 1.5 })
    Console.WriteLine(Kind(o));
~~~
~~~console
null
отрицательное
int
пустая строка
строка hi
что-то ещё
~~~

@@ref id="op-switch-expression" cat="A" title="Выражение switch" cs="8.0" cx="O(1)" mem="O(1)" tags="switch expression => _ when исчерпывающий SwitchExpressionException таблица значений" topic="p1-syntax" related="op-switch-statement,op-patterns-basic,op-pattern-relational,op-ternary" learn="dotnet/csharp/language-reference/operators/switch-expression::Выражение switch"
Выражение `switch` возвращает значение по первой подошедшей ветке `шаблон => результат`, поэтому заменяет цепочку `if/else` или вложенные `?:`, когда нужно вычислить значение.

## Синтаксис {#syntax}

~~~csharp @nocheck
var name = day switch
{
    1 => "пн",
    2 => "вт",
    >= 3 and <= 5 => "середина",
    var d when d > 7 => throw new ArgumentOutOfRangeException(nameof(day)),
    _ => "вых"
};
~~~

## Семантика {#semantics}

- Ветки проверяются **сверху вниз**, выигрывает первая подошедшая.
- Каждая ветка — шаблон, необязательное `when` и результат через `=>`. Ветки разделяются запятыми, после последней запятая допустима.
- Результат — общий тип всех веток (через *best common type*) или целевой тип из контекста (C# 9: `double x = flag switch { true => 1, _ => 2.5 }`).
- Выражение должно быть **исчерпывающим**. Если компилятор не может доказать полноту, он выдаёт предупреждение CS8509; если значение не подошло ни к одной ветке в рантайме — исключение `SwitchExpressionException`.
- `_` — ветка по умолчанию; для перечислений часто опускают `_`, но тогда новое значение enum вызовет предупреждение при следующей сборке — это полезно.
- В ветке можно использовать [`throw`-выражение](#/ref/a/op-throw-expression).
- Компилятор сообщает о недостижимых ветках как об ошибке (CS8510).
- Работает со всеми [шаблонами](#/ref/a/op-patterns-basic), в том числе кортежными.

## Под капотом {#internals}

Преобразуется в то же дерево решений, что и [оператор `switch`](#/ref/a/op-switch-statement), но результат записывается во временную переменную. Для плотных диапазонов целых чисел получается IL-`switch` с таблицей переходов. Если ветки не покрывают значение, вставляется `throw new SwitchExpressionException(value)`.

## Сложность {#complexity}

Как у `switch`: `O(1)` для плотных целых, `O(log k)` для диапазонов, `O(длина)` для строк; для `when`-цепочек — `O(k)`.

## Версии {#versions}

- C# 8 — `switch`-выражение, шаблоны свойств/позиционные/кортежные.
- C# 9 — целевой тип, реляционные и логические шаблоны.
- C# 11 — шаблоны списков.

## Ловушки {#pitfalls}

**Не исчерпывающее выражение на невалидных данных.**

~~~csharp
static string Name(Color c) => c switch
{
    Color.Red => "красный",
    Color.Green => "зелёный",
    Color.Blue => "синий",
};   // ❌ предупреждение CS8509: (Color)42 не покрыт

try { Console.WriteLine(Name((Color)42)); }
catch (System.Runtime.CompilerServices.SwitchExpressionException) { Console.WriteLine("SwitchExpressionException"); }

enum Color { Red, Green, Blue }
~~~
~~~console
SwitchExpressionException
~~~

**Разные типы веток.** `x switch { 1 => 1, _ => "строка" }` не имеет общего типа (до C# 9 не компилировалось; сейчас нужен целевой `object`).

**Порядок.** Узкая ветка после широкой недостижима и считается ошибкой.

**Побочные эффекты в `when`.** Условия вычисляются в порядке веток, но компилятор может переупорядочить проверки между непересекающимися шаблонами.

## Примеры {#examples}

~~~csharp
static string Bmi(double bmi) => bmi switch
{
    < 18.5 => "недовес",
    < 25 => "норма",
    < 30 => "избыток",
    _ => "ожирение"
};
Console.WriteLine(Bmi(17));
Console.WriteLine(Bmi(22));
Console.WriteLine(Bmi(31));

static int Days(int month, bool leap) => month switch
{
    2 => leap ? 29 : 28,
    4 or 6 or 9 or 11 => 30,
    >= 1 and <= 12 => 31,
    _ => throw new ArgumentOutOfRangeException(nameof(month))
};
Console.WriteLine(Days(2, true));
Console.WriteLine(Days(11, false));
Console.WriteLine(Days(12, false));
~~~
~~~console
недовес
норма
ожирение
29
30
31
~~~

@@ref id="op-throw-expression" cat="A" title="Выражение throw" cs="7.0" cx="O(1)" mem="O(1)" tags="throw expression выражение исключение ?? ?: => guard clause ArgumentNullException ThrowIfNull" topic="p1-exceptions" related="op-null-coalescing,op-ternary,op-switch-expression" learn="?dotnet/csharp/language-reference/statements/exception-handling-statements::Выражение throw"
Выражение `throw` бросает исключение в позиции выражения — справа от `??`, в ветках `?:`, в `switch`-выражении и в теле лямбды-выражения — и позволяет писать проверки аргументов в одну строку.

## Синтаксис {#syntax}

~~~csharp @nocheck
var v = value ?? throw new ArgumentNullException(nameof(value));
var r = ok ? result : throw new InvalidOperationException();
Func<int> f = () => throw new NotImplementedException();
public string Name => name ?? throw new InvalidOperationException();
~~~

## Семантика {#semantics}

- Допустимые места: правый операнд `??` и `??=`, вторая или третья часть `?:`, тело `=>` (член-выражение или лямбда), ветка `switch`-выражения.
- Выражение `throw` не имеет типа и совместимо с любым: компилятор считает ветку не возвращающей значение, поэтому в `c ? 1 : throw ...` тип результата определяется только по первой ветке.
- В остальных местах (`var x = throw ...;`, как операнд `+`) выражение `throw` недопустимо.
- Обычный оператор `throw;` (без выражения) для повторной генерации в `catch` по-прежнему доступен; в выражении повторный `throw;` нельзя.
- Стек трассировки заполняется в месте броска, как обычно; объект исключения создаётся, только когда `throw` реально достигнут, так что на обычном пути не тратится время на построение сообщения.
- Интерполированное сообщение вычисляется только в ветке `throw`, то есть лишь при ошибке.
- Для проверки аргументов в современном .NET есть вспомогательные методы: `ArgumentNullException.ThrowIfNull(arg)` (.NET 6), `ArgumentException.ThrowIfNullOrEmpty` (.NET 7), `ArgumentOutOfRangeException.ThrowIfNegative` и другие (.NET 8).

## Под капотом {#internals}

Компилятор раскладывает выражение на условный переход к блоку, который создаёт исключение и выполняет IL `throw`. JIT вынесет такие холодные блоки подальше от основного пути выполнения. Поэтому хелпер вроде `ThrowIfNull` оформлен отдельным методом: короткий вызывающий код лучше встраивается.

## Сложность {#complexity}

Без исключения — `O(1)` и почти бесплатно (одна проверка). Сам бросок исключения дорог (микросекунды и сборка трассировки стека) — не используйте его для обычного потока управления.

## Версии {#versions}

- C# 7.0 — `throw`-выражения.
- .NET 6 — `ArgumentNullException.ThrowIfNull`; .NET 7/8 — другие `ThrowIf*`.

## Ловушки {#pitfalls}

**`throw` в неподдерживаемой позиции.**

~~~csharp
string? name = null;
// var x = throw new Exception();            // ❌ CS8115: throw-выражение здесь недопустимо
try { var s = name ?? throw new ArgumentNullException(nameof(name)); }   // ✅
catch (ArgumentNullException e) { Console.WriteLine(e.ParamName); }
~~~
~~~console
name
~~~

**Исключения для обычных ситуаций.** Бросать `NotImplementedException` в лямбде-заглушке удобно, но не забудьте убрать их до релиза: компилятор не напомнит.

**Исключения для обычных ситуаций.** Нет такого пользователя — не повод бросать; верните `null` или `bool` из `TryGet…`.

**Потеря контекста.** В `catch` бросайте `throw;`, а не `throw ex;`, иначе трассировка начнётся заново.

## Примеры {#examples}

~~~csharp
static int Parse(string s) => int.TryParse(s, out var n) ? n : throw new FormatException($"'{s}' не число");

try { new Person(null!); } catch (ArgumentNullException e) { Console.WriteLine($"Person: {e.ParamName}"); }
Console.WriteLine(Parse("12"));
try { Parse("xx"); } catch (FormatException e) { Console.WriteLine(e.Message); }

try { ArgumentNullException.ThrowIfNull((string?)null, "arg"); }
catch (ArgumentNullException e) { Console.WriteLine(e.ParamName); }

class Person
{
    private readonly string _name;
    public Person(string name) => _name = name ?? throw new ArgumentNullException(nameof(name));
    public string Name => _name;
}
~~~
~~~console
Person: name
12
'xx' не число
arg
~~~
