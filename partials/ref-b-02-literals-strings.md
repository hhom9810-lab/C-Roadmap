@@ref id="ty-literals" cat="B" title="Литералы: числа, строки, raw, UTF-8" cs="1.0" mem="O(1)" tags="литерал суффикс u l f d m 0x 0b разделитель _ raw string верbatim interpolated $ @ u8 UTF-8 литерал escape" topic="p1-types,p1-strings" related="ty-builtin,ty-string,ty-char,op-string-concat" learn="?dotnet/csharp/programming-guide/strings/::Строки и литералы"
Литерал — значение, записанное прямо в коде: число (с суффиксом типа), символ, строка в одной из шести форм или массив UTF-8 байт.

## Синтаксис {#syntax}

~~~csharp @nocheck
42   42u   42L   42UL     // int, uint, long, ulong
3.14   3.14f   3.14m      // double, float, decimal
1_000_000   0xFF   0b1010_1100   // разделитель, hex, двоичный
'a'  '\n'  '\u0041'       // char
"текст\t"                 // обычная строка с escape-последовательностями
@"C:\temp\file"           // verbatim: без escape, "" = кавычка
$"Привет, {name}!"        // интерполяция
$"{x,8:F2}"               // ширина и формат
"""строка "с кавычками" """   // raw string (C# 11)
$$"""{ "id": {{id}} }"""      // raw + интерполяция с $$ 
"abc"u8                   // ReadOnlySpan<byte> в UTF-8 (C# 11)
~~~

## Семантика {#semantics}

- **Числа.** Тип целого литерала — первый из `int`, `uint`, `long`, `ulong`, куда значение помещается. Суффиксы `u`, `l`, `ul`, `f`, `d`, `m` (регистр безразличен, `L` предпочтительнее) задают тип явно. `1.5` — `double`, `1.5f` — `float`, `1.5m` — `decimal`.
- **Разделитель `_`** (C# 7) — для читаемости, допустим внутри числа, но не в начале, конце и рядом с точкой.
- **Escape-последовательности:** `\n`, `\t`, `\\`, `\"`, `\'`, `\0`, `\uXXXX`, `\UXXXXXXXX`, `\xH…`.
- **Verbatim `@"…"`** сохраняет переводы строк и обратные косые черты; кавычка записывается как `""`.
- **Интерполяция `$"…"`** подставляет выражения в `{}`; `{{` и `}}` — фигурные скобки. Формат: `{x:F2}`, выравнивание: `{x,10}`. Можно сочетать `$@` и `@$`.
- **Raw string `"""…"""`** (C# 11): количество кавычек в обрамлении больше любого ряда внутри; отступ закрывающей строки вырезается из всего текста; escape не нужны. В интерполированной версии число `$` задаёт, сколько `{` открывают подстановку.
- **UTF-8 литерал `"…"u8`** создаёт `ReadOnlySpan<byte>` без аллокации — байты лежат в данных сборки.
- Строковые литералы **интернируются**: одинаковые литералы — один объект.
- Тип литерала определяется только записью: `1` — `int` даже при присваивании в `long`; константное целое неявно преобразуется в меньший тип, если помещается (`byte b = 200;`), а `byte b = 300;` — ошибка.

## Под капотом {#internals}

Числовые литералы превращаются в `ldc.*`. Строковые литералы сохраняются в метаданных сборки и загружаются инструкцией `ldstr`, которая возвращает один и тот же интернированный объект. Интерполяция в современных компиляторах превращается либо в `string.Format`, либо в обработчик интерполяции (`DefaultInterpolatedStringHandler`), который пишет в буфер из пула без промежуточных строк. UTF-8 литералы — это ссылка на блок байт в `.data` сборки.

## Сложность {#complexity}

Литерал — `O(1)`. Интерполяция и `Format` — `O(длина результата)` плюс форматирование аргументов.

## Версии {#versions}

- C# 1.0 — суффиксы, verbatim; C# 6 — интерполяция.
- C# 7.0 — двоичные литералы и `_`; C# 7.2 — `0b_1` и ведущий `_` после префикса.
- C# 11 — raw string, UTF-8 литералы, переводы строк внутри `{}`.

## Ловушки {#pitfalls}

**Целое деление из-за литерала без суффикса.**

~~~csharp @nocheck
decimal price = 0.1;       // ❌ CS0664: у 0.1 тип double, нужен суффикс m
~~~

Рабочий вариант и деление, которое «теряет» дробную часть:

~~~csharp
double a = 1 / 2;          // ❌ 0: целочисленное деление, потом преобразование
double b = 1.0 / 2;        // ✅ 0.5
decimal price = 0.1m;      // ✅ суффикс m
Console.WriteLine($"{a} {b} {price}");
~~~
~~~console
0 0.5 0.1
~~~

**Путь с `\` в обычной строке.** `"C:\temp"` — табуляция; используйте `@` или `/`.

**Интерполяция и культура.** `$"{1.5}"` использует текущую культуру (в ru-RU — «1,5»); для стабильности — `FormattableString.Invariant` или `string.Create(CultureInfo.InvariantCulture, …)`.

**`\x` жадный:** `"\x1234"` прочитает до четырёх шестнадцатеричных цифр.

## Примеры {#examples}

~~~csharp
Console.WriteLine(1_000_000 + 0xFF + 0b1010);
Console.WriteLine(3.0f / 2);
Console.WriteLine(@"C:\temp\file");
string name = "мир";
Console.WriteLine($"Привет, {name}! {Math.PI,10:F3}|");

string json = $$"""
    {
      "id": {{42}},
      "name": "x"
    }
    """;
Console.WriteLine(json);

ReadOnlySpan<byte> bytes = "Hi"u8;
Console.WriteLine(bytes.Length + " " + bytes[0]);
Console.WriteLine(ReferenceEquals("lit", "lit"));
~~~
~~~console
1000265
1.5
C:\temp\file
Привет, мир!      3.142|
{
  "id": 42,
  "name": "x"
}
2 72
True
~~~

@@ref id="ty-char" cat="B" title="char, UTF-16 и кодировки" cs="1.0" mem="O(1)" danger="1" tags="char UTF-16 UTF-8 Unicode суррогатные пары Rune кодировка Encoding эмодзи символ кодовая точка IsLetter" topic="p1-strings,p1-types" related="ty-string,ty-literals,ty-builtin" learn="dotnet/standard/base-types/character-encoding-introduction::Кодировка символов в .NET"
`char` — один 16-битный элемент кодирования UTF-16, а не обязательно целый символ Unicode: символы за пределами базовой плоскости занимают два `char` (суррогатную пару).

## Синтаксис {#syntax}

~~~csharp @nocheck
char c = 'A';  char u = '\u0416';  char n = (char)65;
int code = c;                         // неявно в int: 65
char next = (char)(c + 1);            // приведение обратно обязательно
char.IsLetter(c);  char.IsDigit(c);  char.ToUpperInvariant(c);
Rune r = new Rune(0x1F600);           // кодовая точка Unicode (System.Text)
Encoding.UTF8.GetBytes(text);         // строка → байты
~~~

## Семантика {#semantics}

- `char` — беззнаковое 16-битное значение (0–65 535); арифметика над ним даёт `int`, обратно нужно приводить явно.
- Строка в .NET — последовательность `char` в UTF-16. `s.Length` — число `char`, а не число «видимых символов».
- Символы вне BMP (эмодзи, редкие иероглифы) — **суррогатная пара** из двух `char`; `char.IsSurrogatePair` распознаёт её. Целая кодовая точка — `System.Text.Rune`; `s.EnumerateRunes()` перебирает их корректно.
- «Видимый символ» (графема) может состоять из нескольких кодовых точек (буква + диакритика, флаги, семейные эмодзи); для них есть `StringInfo`/`TextElementEnumerator`.
- Литерал `'я'` — один `char`; для символа вне BMP литерала `char` нет, пишут строку `"😀"` или `char.ConvertFromUtf32(0x1F600)`.
- Сравнивать символы лучше напрямую (`c == 'a'`), а не через коды: так читателю понятнее.
- `char.IsLetter`, `IsDigit` и др. учитывают Unicode; методы `ToUpper`/`ToLower` зависят от культуры, поэтому для служебных строк используйте `…Invariant`.
- **Кодировки** переводят строку в байты: `Encoding.UTF8` (по умолчанию для файлов и сети), `Unicode` (UTF-16 LE), `ASCII`, `Latin1`. Некорректные последовательности заменяются символом `�` (U+FFFD).

## Под капотом {#internals}

`char` хранится как 2 байта (`ushort`); строки — массив таких значений с длиной в заголовке. Для UTF-8 .NET использует векторизованные алгоритмы транскодирования; в `Span<byte>` можно работать с UTF-8 напрямую, не создавая строк (`Utf8.ToUtf16`, литералы `u8`).

## Сложность {#complexity}

Операции с одним `char` — `O(1)`. Подсчёт кодовых точек и графем — `O(n)`; `Encoding.GetBytes` — `O(n)` с аллокацией результата.

## Версии {#versions}

- C# 1.0 — `char`; .NET Core 3.0 — `System.Text.Rune`.
- C# 11 — UTF-8 литералы `"…"u8`.
- C# 13 / .NET 9 — escape-последовательность `\e`.

## Ловушки {#pitfalls}

**`Length` и реверс строки с эмодзи.**

~~~csharp
using System.Text;

string s = "a😀";
Console.WriteLine(s.Length);                         // ❌ 3, а не 2: эмодзи — два char
Console.WriteLine(s.EnumerateRunes().Count());       // ✅ 2 кодовые точки
Console.WriteLine(char.IsHighSurrogate(s[1]));       // True: первая половина пары
Console.WriteLine(Encoding.UTF8.GetByteCount(s));    // 5 байт: 1 + 4
~~~
~~~console
3
2
True
5
~~~

**Кодировка по умолчанию.** `Encoding.Default` в .NET Core — UTF-8, в .NET Framework — системная; всегда указывайте кодировку явно.

**Сравнение `char` с `int`.** `c == 65` работает, но выражает неясное намерение.

## Примеры {#examples}

~~~csharp
using System.Text;

char c = 'A';
Console.WriteLine((int)c);
Console.WriteLine((char)(c + 1));
Console.WriteLine(char.IsLetter('Ж') + " " + char.IsDigit('٣'));
Console.WriteLine(char.ToUpperInvariant('я'));

byte[] bytes = Encoding.UTF8.GetBytes("Hi, мир");
Console.WriteLine(bytes.Length);
Console.WriteLine(Encoding.UTF8.GetString(bytes));
Console.WriteLine(BitConverter.ToString(Encoding.UTF8.GetBytes("é")));
Console.WriteLine(Encoding.Unicode.GetBytes("A").Length);
~~~
~~~console
65
B
True True
Я
10
Hi, мир
C3-A9
2
~~~

@@ref id="ty-string" cat="B" title="string: иммутабельность, интернирование, стоимость" cs="1.0" cx="O(n)" mem="O(n)" danger="1" tags="string иммутабельность неизменяемая строка интернирование Intern StringBuilder пул строк ReferenceEquals Substring Span immutable" topic="p1-strings" related="op-string-concat,ty-string-compare,ty-char,ty-span" learn="?dotnet/csharp/programming-guide/strings/::Строки"
`string` — неизменяемая последовательность символов UTF-16: любое «изменение» создаёт новую строку, а литералы и результаты `string.Intern` разделяют один общий объект.

## Синтаксис {#syntax}

~~~csharp @nocheck
string s = "текст";            string e = string.Empty;   // "" 
s.Length  s[0]  s.Substring(1, 3)  s.Replace("т", "x")
string.Join(", ", items)  string.Concat(a, b)  s.Split(',')
string.Intern(s)  string.IsInterned(s)
string.IsNullOrEmpty(s)  string.IsNullOrWhiteSpace(s)
~~~

## Семантика {#semantics}

- **Иммутабельность.** Методы `Replace`, `Substring`, `ToUpper`, `Trim`… возвращают **новую** строку; исходная остаётся прежней. Вызов без использования результата ничего не меняет.
- **Ссылочный тип со значимой семантикой:** `==` сравнивает содержимое, но переменная может быть `null`.
- **Интернирование.** Все строковые литералы в сборке и результаты константного сложения (`"a" + "b"`) попадают в пул и разделяются. Строки, созданные во время выполнения, в пул не попадают, пока вы не вызовете `string.Intern`.
- **Индексатор** возвращает `char` и только читает; `s[0] = 'x'` — ошибка.
- `Substring` копирует; для срезов без копирования используйте `AsSpan()`/`ReadOnlySpan<char>` ([Span](#/ref/b/ty-span)).
- Для построения строки в цикле используйте `StringBuilder` или `string.Join`/`string.Create`, а не `+=` ([стоимость конкатенации](#/ref/a/op-string-concat)).
- Пустая строка и `null` различаются; `string.IsNullOrEmpty` проверяет обе, `IsNullOrWhiteSpace` — ещё и пробелы.

## Под капотом {#internals}

Строка — объект в куче: заголовок, поле длины (`int`) и массив `char` прямо в объекте (строки переменной длины — особый случай в CLR). Максимальная длина — около 1 млрд символов. Хеш-код считается каждый раз по всему тексту (результат не кэшируется), а у `Dictionary<string,…>` по умолчанию используется рандомизированный хеш. Интернированный пул — таблица в CLR; строки в ней не освобождаются GC в обычном режиме.

## Сложность {#complexity}

Длина и индексатор — `O(1)`. `Substring`, `Replace`, `Concat`, `ToUpper` — `O(n)` с аллокацией. `==` — `O(n)` (но быстро выходит при разной длине или совпадении ссылок). `Intern` — `O(n)` плюс поиск в таблице.

## Версии {#versions}

- C# 1.0 — `string`; .NET Core 2.1 — `Span<char>` и срезы строк без копирования.
- .NET 6 — `string.Create` с интерполяцией через обработчики; C# 10 — константная интерполяция строк.
- C# 11 — raw-литералы.

## Ловушки {#pitfalls}

**Ожидание, что метод меняет строку.**

~~~csharp
string s = "hello";
s.ToUpper();                       // ❌ результат потерян
Console.WriteLine(s);              // hello
s = s.ToUpper();                   // ✅
Console.WriteLine(s);              // HELLO
~~~
~~~console
hello
HELLO
~~~

**Сравнение ссылок.** `(object)a == (object)b` для равных, но созданных в рантайме строк — `False`; см. [операторы сравнения](#/ref/a/op-comparison).

**Конкатенация в цикле** создаёт `O(n²)` копирований.

**Интернирование без нужды** увеличивает память: интернированные строки живут до завершения процесса.

## Примеры {#examples}

~~~csharp
string a = "net";
string b = "n" + "et";                         // константа: интернирована
string c = new string(new[] { 'n', 'e', 't' });
Console.WriteLine(ReferenceEquals(a, b));      // True
Console.WriteLine(ReferenceEquals(a, c));      // False
Console.WriteLine(a == c);                     // True
Console.WriteLine(ReferenceEquals(a, string.Intern(c)));   // True

string text = "  Привет,  мир ";
Console.WriteLine($"[{text.Trim()}]");
Console.WriteLine(string.Join("|", "a,b,,c".Split(',')));
Console.WriteLine(string.IsNullOrWhiteSpace("   "));

var sb = new System.Text.StringBuilder();
for (int i = 0; i < 5; i++) sb.Append(i).Append(',');
Console.WriteLine(sb.ToString().TrimEnd(','));
~~~
~~~console
True
False
True
True
[Привет,  мир]
a|b||c
True
0,1,2,3,4
~~~

@@ref id="ty-string-compare" cat="B" title="Сравнение строк и культуры" cs="1.0" cx="O(n)" mem="O(1)" danger="1" tags="сравнение строк StringComparison Ordinal OrdinalIgnoreCase culture CultureInfo InvariantCulture турецкая i сортировка Compare Equals ToUpper" topic="p1-strings" related="op-comparison,ty-string,ty-char" learn="dotnet/standard/base-types/best-practices-strings::Рекомендации по работе со строками"
Результат сравнения строк зависит от правил: `Ordinal` сравнивает коды символов, а культурные сравнения учитывают алфавит и регистр языка, поэтому всегда указывайте `StringComparison` явно.

## Синтаксис {#syntax}

~~~csharp @nocheck
string.Equals(a, b, StringComparison.Ordinal)
a.Equals(b, StringComparison.OrdinalIgnoreCase)
string.Compare(a, b, StringComparison.CurrentCulture)
a.StartsWith("x", StringComparison.OrdinalIgnoreCase)
list.Sort(StringComparer.Ordinal);
new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase)
~~~

## Семантика {#semantics}

- `Ordinal` — сравнение по числовым значениям `char`; быстро, независимо от культуры; для идентификаторов, путей, ключей, протоколов.
- `OrdinalIgnoreCase` — то же, но без различия регистра по правилам Unicode для простых преобразований.
- `CurrentCulture`/`InvariantCulture` — лингвистическое сравнение (ICU/NLS): учитывает диакритику, лигатуры, порядок букв; результат может зависеть от ОС и версии ICU.
- Оператор `==` и `string.Equals(a, b)` без параметра — ординальные. А вот `string.Compare(a, b)` и `a.CompareTo(b)` без параметра — **культурные**.
- Методы без `StringComparison` часто культурные: `ToUpper()`, `StartsWith(string)`, `IndexOf(string)`, `Contains` (ординальный). Лучше всегда передавать параметр.
- Турецкая «i»: в культуре `tr-TR` `"i".ToUpper()` даёт `"İ"`; код с проверкой `s.ToUpper() == "FILE"` ломается. Используйте `ToUpperInvariant()` или `OrdinalIgnoreCase`.
- `null` меньше любой строки в `string.Compare`; `a.CompareTo(null)` > 0, а `null.CompareTo(…)` — исключение.
- Для регистронезависимых ключей словаря и множества передавайте компаратор в конструктор: `StringComparer.OrdinalIgnoreCase` — один раз, и дальше код не думает о регистре.

## Под капотом {#internals}

Ординальные сравнения векторизованы (SIMD) и не обращаются к ОС. Культурные идут через `CompareInfo`, который вызывает ICU (Linux, macOS, современный Windows) или NLS; в режиме `InvariantGlobalization` культурное сравнение вырождается в ординальное. Для хеширования ключей `StringComparer.Ordinal` — самый быстрый вариант.

## Сложность {#complexity}

`O(n)` по длине общей части. Культурные сравнения в разы медленнее ординальных и могут аллоцировать.

## Версии {#versions}

- .NET Framework 1.0 — `StringComparison`; .NET 5 — на Windows и Linux используется ICU по умолчанию.
- .NET 8 — `CompositeFormat`, `SearchValues<string>` для быстрого поиска; .NET Core 3.0 — рандомизированное хеширование строк.

## Ловушки {#pitfalls}

**Культурная зависимость там, где нужна точность.**

~~~csharp
var keys = new Dictionary<string, int>();
keys["Id"] = 1;
Console.WriteLine(keys.ContainsKey("id"));       // ❌ False: по умолчанию ординальное с учётом регистра

var ci = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase) { ["Id"] = 1 };
Console.WriteLine(ci.ContainsKey("id"));         // ✅ True
Console.WriteLine("straße".Equals("STRASSE", StringComparison.OrdinalIgnoreCase));   // False: ß ≠ SS ординально
~~~
~~~console
False
True
False
~~~

**Сортировка пользовательских строк** культурой, а ключей — ординально: смешение приводит к разным порядкам в разных местах.

**Нормализация.** «é» может быть одним символом или `e` + диакритика; ординально они разные. Нормализуйте через `string.Normalize()` (поведение в режиме инвариантной глобализации требует проверки).

**Различия между платформами** при культурном сравнении (ICU против NLS) — требует проверки на целевой ОС.

## Примеры {#examples}

~~~csharp
Console.WriteLine("a" == "A");
Console.WriteLine(string.Equals("a", "A", StringComparison.OrdinalIgnoreCase));
Console.WriteLine(string.CompareOrdinal("apple", "banana") < 0);
Console.WriteLine("file.TXT".EndsWith(".txt", StringComparison.OrdinalIgnoreCase));

var words = new List<string> { "b", "A", "a", "B" };
words.Sort(StringComparer.Ordinal);
Console.WriteLine(string.Join(",", words));
words.Sort(StringComparer.OrdinalIgnoreCase);
Console.WriteLine(string.Join(",", words.Select(w => w.ToLowerInvariant())));

~~~
~~~console
False
True
True
True
A,B,a,b
a,a,b,b
~~~

@@ref id="ty-floating" cat="B" title="float, double и decimal: точность и округление" cs="1.0" mem="O(1)" danger="1" tags="float double decimal точность округление Math.Round banker MidpointRounding 0.1+0.2 IEEE 754 epsilon деньги плавающая точка" topic="p1-types" related="op-float-special,op-division,ty-builtin,op-conversions" learn="dotnet/csharp/language-reference/builtin-types/floating-point-numeric-types::Типы с плавающей запятой"
`float` и `double` хранят двоичные дроби по IEEE 754 и не представляют большинство десятичных (например, 0,1) точно, а `decimal` хранит десятичные дроби и подходит для денег.

## Синтаксис {#syntax}

~~~csharp @nocheck
float f = 1.5f;   double d = 1.5;   decimal m = 1.5m;
Math.Round(2.5)                              // 2 (банковское)
Math.Round(2.5, MidpointRounding.AwayFromZero)   // 3
Math.Round(1.2345m, 2)                       // 1.23
Math.Abs(a - b) < 1e-9                       // сравнение с допуском
double.Epsilon  float.Epsilon                // наименьшее положительное
~~~

## Семантика {#semantics}

- `double` — 64 бита (1 знак, 11 порядок, 52 мантисса), точность 15–17 значащих цифр; `float` — 32 бита, 6–9 цифр; `decimal` — 128 бит: 96-битное целое и масштаб (степень десяти) 0–28.
- Не все десятичные дроби двоично представимы: `0.1 + 0.2` в `double` — `0.30000000000000004`. Это свойство формата, а не ошибка языка.
- **Сравнивать `double` на равенство нельзя** (кроме особых случаев); используйте допуск `Math.Abs(a - b) < eps` или относительную погрешность. `double.Epsilon` — не подходящий допуск: это самое маленькое положительное число (≈ 4,9·10⁻³²⁴).
- `Math.Round` по умолчанию округляет **к чётному** (банковское): `2.5 → 2`, `3.5 → 4`. Для «школьного» округления укажите `MidpointRounding.AwayFromZero`.
- `decimal` сохраняет масштаб: `1.0m` и `1.00m` равны, но печатаются по-разному. Арифметика `decimal` точна для десятичных значений, но делить `1m / 3` всё равно даёт округлённый результат (28 цифр).
- Смешивать `decimal` и `double` без явного приведения нельзя.
- Большие целые, превращённые во `float`, теряют точность: `16 777 217` → `16 777 216`.
- Особые значения (`NaN`, `Infinity`, `−0`) — см. [запись о них](#/ref/a/op-float-special).

## Под капотом {#internals}

`float` и `double` обрабатываются аппаратным блоком FPU/SIMD за один такт; формат определяется стандартом IEEE 754. `decimal` реализован программно в BCL (умножение и сложение 96-битных целых с масштабом) — в десятки раз медленнее `double`. Начиная с .NET Core 3.0 `ToString()` для `double` выдаёт кратчайшую строку, однозначно восстанавливающую значение (round-trip).

## Сложность {#complexity}

Арифметика `double` — `O(1)` на аппаратном уровне; `decimal` — `O(1)`, но с константой на порядок выше. Для массивов чисел `double` векторизуется (`Vector<T>`), `decimal` — нет.

## Версии {#versions}

- C# 1.0 — `float`, `double`, `decimal`; .NET Core 3.0 — IEEE-совместимое форматирование и разбор.
- .NET 5 — `Half`; .NET 7 — обобщённая математика (`INumber<T>`).

## Ловушки {#pitfalls}

**Равенство `0.1 + 0.2 == 0.3`.**

~~~csharp
Console.WriteLine(0.1 + 0.2 == 0.3);                  // ❌ False
Console.WriteLine(0.1 + 0.2);                         // 0.30000000000000004
Console.WriteLine(Math.Abs(0.1 + 0.2 - 0.3) < 1e-9);  // ✅ True
Console.WriteLine(0.1m + 0.2m == 0.3m);               // ✅ True: decimal
~~~
~~~console
False
0.30000000000000004
True
True
~~~

**Банковское округление.** `Math.Round(0.5)` и `Math.Round(2.5)` дают 0 и 2; в финансовых расчётах уточните правило.

**Накопление ошибок.** Суммирование миллионов `float` — используйте `double`, `decimal` или алгоритм Кахана.

**`decimal` и деление.** `1m / 3m * 3m` может не вернуть ровно 1.

## Примеры {#examples}

~~~csharp
Console.WriteLine(0.1f + 0.2f);
Console.WriteLine((double)0.1f);
Console.WriteLine(Math.Round(2.5));
Console.WriteLine(Math.Round(3.5));
Console.WriteLine(Math.Round(2.5, MidpointRounding.AwayFromZero));
Console.WriteLine(Math.Round(1.005m, 2));
Console.WriteLine(1m / 3);
Console.WriteLine(1.0m == 1.00m);
Console.WriteLine(1.00m);
Console.WriteLine((float)16_777_217);
Console.WriteLine(decimal.Round(2.345m, 2, MidpointRounding.AwayFromZero));
~~~
~~~console
0.3
0.10000000149011612
2
4
3
1.00
0.3333333333333333333333333333
True
1.00
16777216
2.35
~~~
