@@ref id="op-null-conditional" cat="A" title="Null-условные операторы (?. и ?[])" cs="6.0" cx="O(1)" mem="O(1)" tags="null-conditional ?. ?[] безопасная навигация NullReferenceException цепочка короткое замыкание событие Invoke" topic="p1-syntax,p1-types" related="op-null-coalescing,op-null-forgiving,op-assignment" learn="dotnet/csharp/language-reference/operators/member-access-operators::Null-условные операторы"
Оператор `?.` обращается к члену только если левый операнд не `null`, иначе всё выражение даёт `null` (или `default` для nullable-значения) и остальная часть цепочки пропускается.

## Синтаксис {#syntax}

~~~csharp @nocheck
person?.Name            // свойство или поле
person?.Greet()         // вызов метода
items?[0]               // индексатор
a?.b?.c?.d              // цепочка
handler?.Invoke(args)   // безопасный вызов делегата
person?.Name = "Bob";   // присваивание — C# 14
~~~

## Семантика {#semantics}

- Если левый операнд `null`, результат — `null`; тип результата становится nullable: `s?.Length` имеет тип `int?`.
- **Короткое замыкание всей цепочки.** В `a?.b.c.d` при `a == null` `b`, `c`, `d` не вычисляются вовсе (а не просто `.c` на `null`). Но если `a` не `null`, а `b` — `null`, то `.c` выбросит `NullReferenceException`: каждая точка, после которой возможен `null`, требует собственного `?.`.
- Аргументы вызова `a?.M(Expensive())` при `a == null` **не вычисляются**.
- Левый операнд вычисляется один раз и сохраняется во временной переменной, поэтому `?.` безопасен для делегатов в многопоточном коде: `handler?.Invoke()` не упадёт, даже если другой поток отписал последний обработчик.
- Для `void`-методов `a?.M()` допустим как оператор-выражение; присвоить результат нельзя.
- Результат `?.` с типом-значением — `Nullable<T>`: `int? len = s?.Length;`. Чтобы получить значение, используйте [`??`](#/ref/a/op-null-coalescing): `s?.Length ?? 0`.
- Результат `await` проверяют в скобках: `(await task)?.X`.

## Под капотом {#internals}

Компилятор сохраняет левую часть во временную переменную, проверяет её на `null` (`brtrue`/`brfalse`) и либо выполняет остаток цепочки, либо подставляет `null`/`default` в результат. Для значимого результата создаётся `Nullable<T>`. Дополнительных аллокаций нет, накладные расходы — одно сравнение.

## Сложность {#complexity}

`O(1)`, одна проверка на `null` на каждый `?.` в цепочке.

## Версии {#versions}

- C# 6.0 — `?.` и `?[]`.
- C# 8 — nullable-анализ учитывает `?.` при выводе состояния `null`.
- C# 14 — null-условное присваивание: `a?.B = value;` и составные `a?.B += 1;` (правая часть вычисляется, только если `a` не `null`).

## Ловушки {#pitfalls}

**Цепочка без второго `?.`.**

~~~csharp
User? u = new User();                       // Address == null
try { Console.WriteLine(u?.Address.City); }  // ❌ u не null, значит .City вычисляется
catch (NullReferenceException) { Console.WriteLine("NRE"); }
Console.WriteLine(u?.Address?.City ?? "нет города");   // ✅

class Address { public string? City; }
class User { public Address? Address; }
~~~
~~~console
NRE
нет города
~~~

**Маскирование ошибок.** Повсеместный `?.` превращает «не должно быть `null`» в молчаливый пропуск операции. Если `null` — признак бага, лучше упасть сразу или проверить явно.

**Типы-значения.** `x?.Length > 0` — это `int? > int`, и при `null` результат `false`; а `x?.Length != 0` при `null` даст `true`!

**Побочные эффекты в аргументах** при `null` не выполняются — это бывает неожиданно: `logger?.Log(Count())`.

## Примеры {#examples}

~~~csharp
string? s = null;
Console.WriteLine(s?.Length);                // (пусто)
Console.WriteLine(s?.Length ?? -1);          // -1
Console.WriteLine(s?.Length != 0);           // True: null != 0

int[]? arr = null;
Console.WriteLine(arr?[0] ?? 42);            // 42

int calls = 0;
int Count() { calls++; return 1; }
string? t = null;
_ = t?.Substring(Count());                   // аргумент не вычисляется
Console.WriteLine(calls);                    // 0

Action? handler = () => Console.WriteLine("вызван");
handler?.Invoke();
handler = null;
handler?.Invoke();                           // тихо ничего не делает
~~~
~~~console

-1
True
42
0
вызван
~~~

@@ref id="op-null-coalescing" cat="A" title="Оператор объединения с null (?? и ??=)" cs="2.0" cx="O(1)" mem="O(1)" tags="null-coalescing ?? ??= значение по умолчанию ленивая инициализация throw expression" topic="p1-syntax,p1-types" related="op-null-conditional,op-ternary,op-null-forgiving,op-throw-expression" learn="dotnet/csharp/language-reference/operators/null-coalescing-operator::Операторы ?? и ??="
Оператор `a ?? b` возвращает `a`, если он не `null`, иначе `b`; оператор `a ??= b` присваивает `b` переменной `a` только когда `a` равен `null`.

## Синтаксис {#syntax}

~~~csharp @nocheck
var name = input ?? "аноним";
list ??= new List<int>();
var x = a ?? b ?? c;           // правая ассоциативность: a ?? (b ?? c)
var v = dict ?? throw new ArgumentNullException(nameof(dict));
~~~

## Семантика {#semantics}

- `a ?? b`: левый операнд вычисляется один раз; правый — только если левый `null` (короткое замыкание).
- Левый операнд должен быть ссылочным типом или `Nullable<T>`. Для `int? a` выражение `a ?? 0` имеет тип `int`.
- Тип результата — «общий» тип операндов: `int? ?? long` даёт `long`.
- Оператор **правоассоциативен**, так что цепочки читаются слева направо: «первое не-`null`».
- `a ??= b` эквивалентно `a ?? (a = b)` с однократным вычислением `a` и без присваивания, когда `a` не `null`: `b` не вычисляется, а сеттер свойства не вызывается.
- Для `int? ?? int?` результат остаётся `int?`; тип `int` получается, только когда правый операнд не nullable.
- Различайте `??` и `?:` ([тернарный оператор](#/ref/a/op-ternary)): `??` проверяет только на `null`; `0`, пустая строка и `false` для него — обычные значения.
- Правая часть может быть выражением `throw` ([throw-выражение](#/ref/a/op-throw-expression)).

## Под капотом {#internals}

Компилятор делает `dup` левого значения, проверяет `brtrue` и при `null` вычисляет правую часть. Для `Nullable<T>` вызывается `GetValueOrDefault` или `HasValue`/`Value`. `??=` для свойств превращается в `get`, проверку и, при необходимости, `set`.

## Сложность {#complexity}

`O(1)` и очень дёшево: одна проверка и условный переход. Для ленивой инициализации экономит `new`, пока значение не нужно; но `??=` **не потокобезопасен** — для многопоточного кода используйте `Lazy<T>` или `Interlocked.CompareExchange`.

## Версии {#versions}

- C# 2.0 — `??` вместе с `Nullable<T>`.
- C# 7.0 — выражения `throw` справа от `??`.
- C# 8 — `??=`, а также совместимость с nullable reference types.

## Ловушки {#pitfalls}

**Ожидание, что `??` заменит пустую строку.**

~~~csharp
string? s = "";
Console.WriteLine((s ?? "по умолчанию").Length);                           // ❌ 0: пустая строка — не null
Console.WriteLine((string.IsNullOrEmpty(s) ? "по умолчанию" : s).Length);  // ✅ 12
~~~
~~~console
0
12
~~~

**`??=` в многопоточном коде.** Два потока могут одновременно увидеть `null` и оба выполнить инициализацию.

**Дорогая правая часть.** Она не вычисляется при непустом левом, это хорошо, но если там побочный эффект, он не гарантирован.

**Лишний `??` на не-nullable.** Если левый операнд не может быть `null` (значимый тип или non-nullable ссылка при включённом анализе), компилятор предупредит, что правая часть недостижима, — это сигнал пересмотреть тип.

**Смешение с `?.`.** `a?.b ?? c` берёт `c` и когда `a` равен `null`, и когда `a.b` равен `null`.

## Примеры {#examples}

~~~csharp
string? a = null, b = null, c = "третий";
Console.WriteLine(a ?? b ?? c);              // третий

int? n = null;
int value = n ?? 10;
Console.WriteLine(value);                    // 10

List<int>? list = null;
list ??= new List<int>();
list.Add(1);
list ??= new List<int> { 99 };               // не выполняется: list уже не null
Console.WriteLine(list.Count);               // 1

static string Config(string? v) => v ?? throw new ArgumentNullException(nameof(v));
try { Config(null); }
catch (ArgumentNullException e) { Console.WriteLine(e.ParamName); }   // v
~~~
~~~console
третий
10
1
v
~~~

@@ref id="op-null-forgiving" cat="A" title="Null-прощающий оператор (!)" cs="8.0" cx="O(1)" mem="O(1)" danger="1" tags="null-forgiving ! suppress nullable reference types NRT предупреждение CS8602 подавление" topic="p1-types" related="op-null-conditional,op-null-coalescing" learn="dotnet/csharp/language-reference/operators/null-forgiving::Null-прощающий оператор"
Постфиксный `!` говорит компилятору «это выражение не `null`» и подавляет предупреждения nullable-анализа; во время выполнения он ничего не проверяет и ничего не делает.

## Синтаксис {#syntax}

~~~csharp @nocheck
string s = maybeNull!;      // подавить предупреждение CS8600
int len = maybeNull!.Length;
dict["k"]!.Add(1);
public string Name { get; set; } = null!;   // «инициализирует кто-то другой»
~~~

## Семантика {#semantics}

- Работает только при включённом `<Nullable>enable</Nullable>` (или `#nullable enable`). Иначе `!` просто допустим и бесполезен.
- Меняет **только статический вывод компилятора**: тип `string?` для него становится `string`. Значение остаётся прежним, и если там действительно `null`, ошибка проявится позже.
- Это не оператор логического отрицания `!x`: тот префиксный и применяется к `bool`; null-прощающий — постфиксный.
- Оператор нужен прежде всего на границах с «старым» кодом без аннотаций и там, где данные приходят извне.
- Подавляйте предупреждение как можно ближе к месту, а не отключайте анализ на весь файл через `#nullable disable`.
- Подавление действует на одно выражение: следующее обращение к той же переменной анализатор снова сочтёт потенциально `null`, пока вы не проверите её или не присвоите значение.
- Типичные законные случаи: поля, которые инициализирует фреймворк (DI, ORM, десериализатор); инварианты, которые компилятор не может вывести; тесты, где `null` в других местах проверяется отдельно.
- Лучше, чем `!`, обычно: `required` члены (C# 11), `[MemberNotNull]`, `[NotNullWhen]` и проверка `if (x is null) throw ...`.

## Под капотом {#internals}

IL не содержит никакого кода для `!`: атрибуты nullable (`[Nullable]`, `[NullableContext]`) записываются в метаданные, а сам оператор исчезает при компиляции. Поэтому он бесплатен — и ничего не гарантирует.

## Сложность {#complexity}

Нулевые затраты времени выполнения.

## Версии {#versions}

- C# 8 — оператор `!` вместе с nullable reference types.
- C# 11 — модификатор `required` частично заменяет `= null!` для обязательных свойств.

## Ловушки {#pitfalls}

**Подавление вместо проверки.** Лучше всего `!` работает там, где инвариант действительно гарантирован кодом выше, но анализатор его не видит; в остальных случаях выберите явную проверку.

~~~csharp
string? text = Environment.GetEnvironmentVariable("NO_SUCH_VAR_12345");
try { Console.WriteLine(text!.Length); }     // ❌ предупреждения нет, но NRE во время выполнения
catch (NullReferenceException) { Console.WriteLine("NRE"); }
Console.WriteLine(text?.Length ?? 0);        // ✅
~~~
~~~console
NRE
0
~~~

**«Лишний» `!` как привычка.** Каждый такой оператор — место, где компилятор перестал вас страховать; в код-ревью их стоит оспаривать.

**Путаница с отрицанием.** Постфиксный `!` ни на что не влияет в рантайме, поэтому `x!.Foo()` при `null` упадёт точно так же, как `x.Foo()`.

**Путаница с отрицанием.** `!x.IsValid` отрицает результат, а `x!.IsValid` подавляет предупреждение.

## Примеры {#examples}

~~~csharp
#nullable enable
string? raw = "42";
int n = int.Parse(raw!);                // raw здесь не null — компилятор не может это вывести

var map = new Dictionary<string, List<int>> { ["a"] = new() };
map["a"]!.Add(1);                       // индексатор возвращает List<int>, ! здесь не нужен — это лишь демонстрация синтаксиса
Console.WriteLine(n + map["a"].Count);  // 43
~~~
~~~console
43
~~~

@@ref id="op-ternary" cat="A" title="Условный оператор (?:) и ?? против ?:" cs="1.0" cx="O(1)" mem="O(1)" tags="тернарный условный ?: if else выражение target-typed ref ternary вложенный" topic="p1-syntax" related="op-null-coalescing,op-logical,op-switch-expression" learn="dotnet/csharp/language-reference/operators/conditional-operator::Условный оператор ?:"
Оператор `cond ? a : b` вычисляет только одну из двух веток и возвращает её значение; он годится там, где нужно именно выражение, а не оператор `if`.

## Синтаксис {#syntax}

~~~csharp @nocheck
var label = score >= 60 ? "зачёт" : "незачёт";
int abs = x < 0 ? -x : x;
ref int slot = ref (flag ? ref a : ref b);      // ref-тернарный, C# 7.2
~~~

## Семантика {#semantics}

- Условие обязано иметь тип `bool`; никаких «истинных» чисел и строк, как в C/JS.
- Вычисляется только выбранная ветка: вызов дорогого метода в невыбранной ветке не происходит.
- В интерполированных строках условный оператор нужно брать в скобки: `$"{(ok ? 1 : 2)}"`, иначе двоеточие воспринимается как спецификатор формата.
- Тип результата: если у одной ветки есть неявное преобразование в тип другой, берётся тот тип; иначе, начиная с C# 9, работает *target typing* — тип берётся из контекста (`double? d = flag ? 1 : null;`). До C# 9 `flag ? 1 : null` не компилировался.
- **Правоассоциативен:** `a ? b : c ? d : e` — это `a ? b : (c ? d : e)`. Цепочки из трёх и более веток читаются плохо; для них лучше [switch-выражение](#/ref/a/op-switch-expression).
- Ветки могут быть `ref`-выражениями: оба обязаны быть `ref` одновременно.
- `?:` и `??` решают разные задачи: `x ?? y` — «если `x` равно `null`», `c ? x : y` — «если условие истинно». Для значений вроде `0` или `""` нужен `?:`.

## Под капотом {#internals}

Компилируется в условные переходы: `brfalse` на ветку «иначе», обе ветки сливаются в общей точке. Для простых случаев JIT может заменить ветвление на безветвевую инструкцию (`cmov`) — семантика не меняется, но предсказуемость времени растёт.

## Сложность {#complexity}

`O(1)`. По стоимости эквивалентен `if/else`.

## Версии {#versions}

- C# 1.0 — `?:`.
- C# 7.2 — `ref`-условное выражение.
- C# 9 — target-typed условное выражение.

## Ловушки {#pitfalls}

**Разные типы веток в старом синтаксисе и неожиданное преобразование.**

~~~csharp
bool flag = true;
object o = flag ? 1 : "строка";   // ❌ в C# 9+ компилируется благодаря целевому типу object; до этого — ошибка CS0173
var v = flag ? 1 : 2.5;           // тип double: значение 1 хранится как 1.0
Console.WriteLine(o);
Console.WriteLine(v);
~~~
~~~console
1
1
~~~

**Приоритет.** `?:` слабее почти всех операторов, кроме присваивания и лямбды: `a + b > 0 ? x : y` читается как `((a + b) > 0) ? x : y`, но смешение с `??` требует скобок.

**Вложенные тернарные** трудно читать и отлаживать: каждая ветка — потенциальная ошибка в условии.

**Побочные эффекты в ветках.** Использовать `?:` как замену `if` ради вызовов `cond ? A() : B();` нельзя — это не оператор-выражение. Пишите `if`.

## Примеры {#examples}

~~~csharp
int a = 5, b = 9;
int max = a > b ? a : b;
Console.WriteLine(max);                       // 9

int? maybe = true ? 1 : null;                 // C# 9: целевой тип int?
Console.WriteLine(maybe);                     // 1

int x = 10, y = 20;
ref int bigger = ref (x > y ? ref x : ref y);
bigger = 0;
Console.WriteLine($"{x} {y}");                // 10 0

int n = 7;
string kind = n % 2 == 0 ? "чётное" : n % 3 == 0 ? "кратно 3" : "прочее";
Console.WriteLine(kind);                      // прочее
~~~
~~~console
9
1
10 0
прочее
~~~

@@ref id="op-is-as" cat="A" title="Операторы is, is not и as" cs="1.0" cx="O(1)" mem="O(1)" tags="is as is not приведение типов проверка типа downcast pattern matching typeof InvalidCastException" topic="p1-inheritance,p1-types" related="op-patterns-basic,op-conversions,op-null-conditional" learn="dotnet/csharp/language-reference/operators/type-testing-and-cast::Операторы проверки типа и приведения"
`is` проверяет, совместим ли объект с типом или шаблоном, `as` пытается привести ссылку к типу и возвращает `null` при неудаче вместо исключения, а круглые скобки `(T)x` приводят принудительно и бросают `InvalidCastException`.

## Синтаксис {#syntax}

~~~csharp @nocheck
if (obj is string) { }               // только проверка
if (obj is string s) { }             // проверка + переменная (C# 7)
if (obj is not null) { }             // отрицание шаблона (C# 9)
if (obj is not string t) return;     // t определена после if
var d = obj as Dog;                  // Dog или null
var d2 = (Dog)obj;                   // исключение при несовместимости
~~~

## Семантика {#semantics}

- `x is T` — истина, если `x` не `null` и его **динамический** тип совместим с `T` (тот же, производный, реализует интерфейс, либо упаковка).
- `x as T` — то же, но результат: значение типа `T` либо `null`. Работает только с ссылочными и nullable-типами; `obj as int` — ошибка, нужен `int?`.
- `as` и `is` не вызывают пользовательских преобразований, они проверяют только цепочку наследования и упаковки/распаковки.
- `(T)x` учитывает и пользовательские явные операторы, поэтому может сработать там, где `as` не сработает.
- `is not` в C# 9 — естественная запись отрицания: `if (x is not Dog d) return;` — переменная `d` определённо присвоена после проверки.
- Предпочтительная форма — `is T t`: одна проверка и сразу переменная, без повторного приведения.

## Под капотом {#internals}

Для ссылочных типов используется IL `isinst` (проверка с возвратом ссылки или `null`) и `castclass` (приведение с исключением). Для запечатанных (`sealed`) классов JIT сводит проверку к сравнению указателя на таблицу методов; для интерфейсов и открытых иерархий — вызов вспомогательной функции кэша приведений. `is T t` для значимого типа выполняет проверку упаковки и распаковку.

## Сложность {#complexity}

`O(1)` для класса (проверка по цепочке наследования ограничена глубиной иерархии) и интерфейса (через кэш приведения). Ничего не выделяет в куче.

## Версии {#versions}

- C# 1.0 — `is`, `as`, `(T)`.
- C# 7.0 — `is T t` (шаблон объявления).
- C# 9 — `is not`, `is null` / `is not null` как стандартная проверка.

## Ловушки {#pitfalls}

**Использование результата `as` без проверки.**

~~~csharp
object o = "строка";
var n = o as string;
var d = o as Uri;                      // null
try { Console.WriteLine(d.AbsoluteUri); }   // ❌ NRE: результат as нужно проверить
catch (NullReferenceException) { Console.WriteLine("d == null"); }

if (o is string s) Console.WriteLine(s.Length);   // ✅ 6
~~~
~~~console
d == null
6
~~~

**`as` скрывает баг.** Если тип должен быть известен, `(T)x` с понятным исключением лучше, чем `NullReferenceException` где-то дальше.

**`is` не учитывает пользовательские преобразования:** `42 is long` — `false` (хотя `int` неявно преобразуется в `long`, `is` проверяет именно тип).

**Сравнение с `null` для значимых типов:** `x as int?` допустим, а `x as int` — нет.

## Примеры {#examples}

~~~csharp
object[] items = { 1, "два", 3.0, null!, new List<int> { 4 } };
foreach (var item in items)
{
    string d = item switch { null => "null", int i => $"int {i}", string s => $"string {s}", IEnumerable<int> e => "последовательность int", _ => item.GetType().Name };
    Console.WriteLine(d);
}

object o = 42;
if (o is not string text) Console.WriteLine("не строка");
Console.WriteLine(o is long);          // False
Console.WriteLine((o as int?) + 1);    // 43
~~~
~~~console
int 1
string два
Double
null
последовательность int
не строка
False
43
~~~
