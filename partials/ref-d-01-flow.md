@@ref id="fl-if" cat="D" title="if, else и охранные условия" cs="1.0" cx="O(1)" mem="O(1)" tags="if else условие ветвление guard clause ранний возврат вложенность тернарный dangling else" topic="p1-syntax" related="op-ternary,op-logical,op-switch-statement,op-patterns-basic" learn="dotnet/csharp/language-reference/statements/selection-statements::Операторы выбора"
`if` выполняет блок, когда условие равно `true`; необязательная ветка `else` — в противном случае. Условие должно быть строго типа `bool`: целые числа и ссылки как условие не годятся.

## Синтаксис {#syntax}

~~~csharp @nocheck
if (x > 0) { ... }
else if (x < 0) { ... }
else { ... }
if (obj is string s && s.Length > 0) { /* s доступна здесь */ }
if (x is not null) { ... }
~~~

## Семантика {#semantics}

- Условие — выражение типа `bool` (или тип с операторами `true`/`false`). Запись `if (x = 5)` для `int` не скомпилируется, чем C# отличается от C.
- Если в ветке один оператор, фигурные скобки необязательны, но надёжнее всегда ставить их: добавление второй строки не изменит смысл незаметно.
- `else` относится к ближайшему `if` («висячий else»). Скобки снимают неоднозначность.
- Переменные, объявленные через `is` в условии, видны в теле `if` и за его пределами при определённом условии присваивания (правило definite assignment).
- Условия вычисляются слева направо; `&&` и `||` — короткого замыкания: правая часть не вычисляется, если результат уже известен.
- **Охранные условия** (guard clauses): проверяйте плохие случаи в начале метода и сразу выходите (`return`, `throw`). Это уменьшает вложенность и делает основной путь читаемым.
- Цепочки `else if` из одного значения удобнее заменять на `switch`-выражение или шаблоны.
- Для присваивания по условию используйте тернарный оператор, а не `if` с двумя присваиваниями.
- На практике держите условия короткими: сложное выражение выносите в булеву переменную или метод с говорящим именем (`isEligible`), это читается лучше комментария. Избегайте отрицаний в именах и двойных отрицаний: `if (!notFound)` заставляет перечитывать.

## Под капотом {#internals}

Компилятор превращает `if` в условные переходы IL (`brfalse`, `brtrue`). JIT может переставить блоки по профилю выполнения и убрать проверки, если условие известно заранее.

## Сложность {#complexity}

Одна проверка — единицы тактов. Цепочка из `n` условий в худшем случае даёт `n` проверок; `switch` по плотным константам компилируется в таблицу переходов и работает за `O(1)`.

## Версии {#versions}

- C# 1.0 — `if`/`else`; C# 7.0 — переменные шаблонов в условии (`is T x`).
- C# 9 — `is not`, комбинаторы шаблонов `and`/`or`; C# 11 — шаблоны списков.

## Ловушки {#pitfalls}

**Вложенность вместо охранных условий.**

~~~csharp
Console.WriteLine(Describe(null));
Console.WriteLine(Describe(""));
Console.WriteLine(Describe("привет"));

static string Describe(string? s)
{
    if (s is null) return "нет строки";      // ✅ охранное условие
    if (s.Length == 0) return "пустая";
    return $"строка из {s.Length} символов";
}
~~~
~~~console
нет строки
пустая
строка из 6 символов
~~~

**Висячий `else`.** Без скобок `else` присоединяется к внутреннему `if`.

**Сравнение `bool` с `true`:** `if (flag == true)` — лишний шум.

**Побочные эффекты в условии** с `&&`/`||` могут не выполниться из-за короткого замыкания.

## Примеры {#examples}

~~~csharp
int x = 7;
if (x % 2 == 0) Console.WriteLine("чётное");
else if (x > 5) Console.WriteLine("нечётное и больше 5");
else Console.WriteLine("нечётное малое");

object o = "abc";
if (o is string s && s.Length == 3) Console.WriteLine(s.ToUpper());
~~~
~~~console
нечётное и больше 5
ABC
~~~

@@ref id="fl-loops" cat="D" title="Циклы for, while, do-while" cs="1.0" cx="O(n)" mem="O(1)" tags="for while do while цикл счётчик бесконечный цикл off-by-one переменная цикла замыкание" topic="p1-syntax" related="fl-foreach,fl-jumps,cl-local-closures" learn="dotnet/csharp/language-reference/statements/iteration-statements::Операторы итерации"
Циклы повторяют блок: `for` — когда известны счётчик и границы, `while` — пока истинно условие, `do-while` — минимум один раз, а затем пока истинно условие.

## Синтаксис {#syntax}

~~~csharp @nocheck
for (int i = 0; i < n; i++) { ... }
for (int lo = 0, hi = n - 1; lo < hi; lo++, hi--) { ... }
while (queue.Count > 0) { ... }
do { line = Read(); } while (line is null);
for (;;) { ... break; }            // бесконечный
~~~

## Семантика {#semantics}

- Заголовок `for` состоит из инициализации (один раз), условия (перед каждой итерацией) и итератора (после тела). Любая часть может быть пустой.
- Переменная `i`, объявленная в `for`, существует только в цикле; повторное объявление `i` после цикла разрешено.
- `while` проверяет условие **до** тела, `do-while` — **после**; поэтому `do-while` подходит для «прочитать, затем проверить».
- В `for` одна переменная живёт на весь цикл: лямбда, захватившая `i`, видит её итоговое значение ([замыкания](#/ref/c/cl-local-closures)).
- Условие вычисляется на каждой итерации: вызов `list.Count` или `s.Length` в заголовке выполняется каждый раз (для массивов JIT это оптимизирует).
- Изменение коллекции во время обхода по индексу допустимо, но легко приводит к пропуску элементов; при удалении идите с конца.
- Для обхода «просто всех» предпочитайте `foreach`: он исключает ошибки на границах.
- Бесконечный `while (true)` выходит через `break`, `return`, `throw` или `goto`; отмена в асинхронном коде — через `CancellationToken`.
- Проверка `i <= n` вместо `i < n` — типичная ошибка на единицу (off-by-one).
- На практике выбирайте цикл по смыслу: `for` — когда важен индекс, `while` — когда число шагов заранее неизвестно, `do-while` — когда тело нужно выполнить хотя бы раз. Вложенные циклы с большими `n` — первый кандидат на оптимизацию, например заменой внутреннего поиска словарём.

## Под капотом {#internals}

Все циклы — условные переходы назад. JIT перемещает проверку условия в конец цикла («инверсия цикла»), выносит неизменные вычисления и убирает проверки границ массива для канонической формы `for (i = 0; i < a.Length; i++)`.

## Сложность {#complexity}

Время — `O(число итераций × стоимость тела)`; память — `O(1)`. Вложенные циклы перемножают сложность.

## Версии {#versions}

- C# 1.0 — все три цикла.
- .NET 5+ — динамическая оптимизация циклов (OSR, PGO) в JIT.

## Ловушки {#pitfalls}

**Замыкание на переменную `for`.**

~~~csharp
var fs = new List<Func<int>>();
for (int i = 0; i < 3; i++) fs.Add(() => i);         // ❌ одна общая i
Console.WriteLine(string.Join(",", fs.Select(f => f())));

var gs = new List<Func<int>>();
for (int i = 0; i < 3; i++) { int k = i; gs.Add(() => k); }   // ✅ копия на итерацию
Console.WriteLine(string.Join(",", gs.Select(f => f())));
~~~
~~~console
3,3,3
0,1,2
~~~

**Ошибка на единицу:** `<=` вместо `<`, особенно с индексами.

**Бесконечный цикл** из-за забытого изменения счётчика.

**Удаление при прямом обходе** пропускает элементы.

## Примеры {#examples}

~~~csharp
int sum = 0;
for (int i = 1; i <= 5; i++) sum += i;
Console.WriteLine(sum);

int n = 27, steps = 0;
while (n != 1) { n = n % 2 == 0 ? n / 2 : 3 * n + 1; steps++; }
Console.WriteLine(steps);

int tries = 0;
do { tries++; } while (tries < 3);
Console.WriteLine(tries);
~~~
~~~console
15
111
3
~~~

@@ref id="fl-foreach" cat="D" title="foreach и перечисление коллекций" cs="1.0" cx="O(n)" mem="O(1)" tags="foreach IEnumerable IEnumerator GetEnumerator InvalidOperationException изменение коллекции во время перебора Span ref struct enumerator" topic="p2-iterators,p1-syntax" related="fl-loops,fl-iterators,ty-span" learn="dotnet/csharp/language-reference/statements/iteration-statements::foreach"
`foreach` обходит любую последовательность, у которой есть метод `GetEnumerator`: он сам вызывает `MoveNext`, читает `Current` и освобождает перечислитель.

## Синтаксис {#syntax}

~~~csharp @nocheck
foreach (var x in list) { ... }
foreach (var (k, v) in dict) { ... }        // деконструкция
foreach (ref readonly var p in points) { }   // по ссылке (C# 7.3+ для массивов и Span)
await foreach (var m in stream) { }          // IAsyncEnumerable<T>
~~~

## Семантика {#semantics}

- Работает с типами, имеющими публичный `GetEnumerator()` (утиная типизация), либо реализующими `IEnumerable`/`IEnumerable<T>`.
- Переменная цикла **только для чтения**: присвоить ей значение нельзя (CS1656).
- Изменение **коллекции** (`Add`, `Remove`) во время `foreach` по `List<T>` и `Dictionary<,>` приводит к `InvalidOperationException` («Collection was modified»). Изменять сами элементы-объекты можно.
- Перечислитель, реализующий `IDisposable`, освобождается автоматически, даже при исключении (как `using`).
- Для массивов и `Span<T>` компилятор генерирует цикл по индексу без аллокаций.
- Коллекции .NET часто возвращают структуру-перечислитель: `List<T>.Enumerator` не создаёт объекта в куче, пока вы не обращаетесь к списку через `IEnumerable<T>`.
- Начиная с C# 5 переменная `foreach` создаётся заново на каждой итерации, поэтому замыкания безопасны.
- Для асинхронных источников используется `await foreach`.
- Порядок обхода зависит от коллекции: у `Dictionary` он не гарантирован документацией.
- На практике для удаления по условию используйте `RemoveAll` или стройте новую коллекцию через LINQ; для индекса вместе с элементом пригодится `foreach (var (item, i) in list.Select((x, i) => (x, i)))`. В горячем коде обход `List<T>` и массива через `foreach` не уступает `for`.

## Под капотом {#internals}

`foreach` разворачивается в `try { while (e.MoveNext()) { var x = e.Current; ... } } finally { e.Dispose(); }`. Для `List<T>` версия коллекции проверяется на каждом `MoveNext` — отсюда исключение при изменении.

## Сложность {#complexity}

`O(n)` по числу элементов; обход через интерфейс `IEnumerable<T>` добавляет виртуальные вызовы и (для структур-перечислителей) упаковку.

## Версии {#versions}

- C# 1.0 — `foreach`; C# 5 — свежая переменная на итерацию.
- C# 8 — `await foreach`; C# 7.3 — `ref` итерация по массивам и `Span<T>`.

## Ловушки {#pitfalls}

**Изменение списка во время обхода.**

~~~csharp
var list = new List<int> { 1, 2, 3, 4 };
try { foreach (var x in list) if (x == 2) list.Remove(x); }   // ❌
catch (InvalidOperationException e) { Console.WriteLine("ошибка: " + e.Message.Split('.')[0]); }

list.RemoveAll(x => x % 2 == 0);                              // ✅
Console.WriteLine(string.Join(",", list));
foreach (var x in list.ToList()) if (x == 1) list.Remove(x);  // ✅ обход копии
Console.WriteLine(string.Join(",", list));
~~~
~~~console
ошибка: Collection was modified; enumeration operation may not execute
1,3
3
~~~

**Присваивание переменной цикла** запрещено; для структур в `List<T>` изменения копии теряются.

**Многократный обход ленивой последовательности** пересчитывает её каждый раз.

**Приведение типа:** `foreach (string s in objects)` молча вставляет приведение и может бросить `InvalidCastException`.

## Примеры {#examples}

~~~csharp
var d = new Dictionary<string, int> { ["a"] = 1, ["b"] = 2 };
foreach (var (k, v) in d) Console.WriteLine($"{k}={v}");

foreach (char c in "abc") Console.Write(c + "|");
Console.WriteLine();

var r = new Range3();
foreach (var x in r) Console.Write(x + " ");
Console.WriteLine();

class Range3 { public IEnumerator<int> GetEnumerator() { for (int i = 1; i <= 3; i++) yield return i; } }
~~~
~~~console
a=1
b=2
a|b|c|
1 2 3
~~~

@@ref id="fl-jumps" cat="D" title="break, continue, goto и return" cs="1.0" cx="O(1)" mem="O(1)" tags="break continue goto return переход метка вложенные циклы выход из цикла switch fall-through" topic="p1-syntax" related="fl-loops,fl-foreach,op-switch-statement" learn="dotnet/csharp/language-reference/statements/jump-statements::Операторы перехода"
Операторы перехода меняют обычный порядок выполнения: `break` выходит из цикла или `switch`, `continue` переходит к следующей итерации, `return` завершает метод, `goto` прыгает на метку.

## Синтаксис {#syntax}

~~~csharp @nocheck
break;   continue;   return;   return value;
goto done;  ...  done: Console.WriteLine();
goto case 2;   goto default;     // внутри switch
yield break;                      // завершение итератора
~~~

## Семантика {#semantics}

- `break` завершает ближайший объемлющий `for`, `foreach`, `while`, `do` или `switch`. Из вложенных циклов выйти сразу нельзя.
- `continue` пропускает остаток тела и переходит к проверке условия (в `for` — к итератору).
- `return` завершает метод; в `async`-методе — завершает задачу. В `try` с `finally` блок `finally` выполнится до фактического выхода.
- `goto` допустим внутри метода на метку той же или объемлющей области видимости; в блок или `finally` перейти нельзя. В `switch` — единственный способ «провалиться» в другую ветку.
- В `switch` каждая ветка обязана заканчиваться переходом (`break`, `return`, `throw`, `goto`); неявное «проваливание» запрещено (CS8120).
- Выход из вложенных циклов: вынесите их в метод и используйте `return`, либо флаг, либо `goto`. Для читаемости чаще лучше метод.
- Метки, на которые нет переходов, вызывают предупреждение.
- Чрезмерное использование `continue` и `break` усложняет чтение; иногда достаточно инвертировать условие.
- На практике `return` в начале метода (охранное условие) и `continue` в начале тела цикла уменьшают вложенность. `goto` оправдан редко: в автоматах состояний, в `switch` для перехода между ветками и в сгенерированном коде.
- Метки видны во всём методе, но не за пределами лямбд и локальных функций. Если нужно прервать несколько уровней вложенности в асинхронном коде, вместо `goto` применяйте отдельный метод или `CancellationToken`, чтобы поведение было предсказуемым и тестируемым.

## Под капотом {#internals}

Все эти операторы — инструкции безусловного или условного перехода IL (`br`, `leave`). Выход из `try` компилируется в `leave`, который запускает `finally`.

## Сложность {#complexity}

Бесплатны: один переход. Они сокращают работу, пропуская итерации.

## Версии {#versions}

- C# 1.0 — все операторы перехода; C# 2.0 — `yield break`.
- C# 7.0 — `return ref` и `ref`-локальные.

## Ловушки {#pitfalls}

**`break` выходит только из внутреннего цикла.**

~~~csharp
int found = -1;
for (int i = 0; i < 3; i++)
{
    for (int j = 0; j < 3; j++)
    {
        if (i * j == 2) { found = i * 10 + j; break; }     // ❌ выйдет только из j-цикла
    }
}
Console.WriteLine(found);
Console.WriteLine(Find());

static int Find()
{
    for (int i = 0; i < 3; i++)
        for (int j = 0; j < 3; j++)
            if (i * j == 2) return i * 10 + j;             // ✅ return выходит из обоих
    return -1;
}
~~~
~~~console
21
12
~~~

**`continue` в `do-while`** переходит к проверке условия, а не к началу тела.

**`goto` внутрь блока** запрещён.

**Забытый `break` в `switch`** — ошибка компиляции, но не в ветке без операторов.

## Примеры {#examples}

~~~csharp
foreach (var n in new[] { 1, 2, 3, 4, 5, 6 })
{
    if (n % 2 == 0) continue;
    if (n > 4) break;
    Console.Write(n + " ");
}
Console.WriteLine();

int i = 0;
loop:
if (i < 3) { Console.Write(i++); goto loop; }
Console.WriteLine();
~~~
~~~console
1 3 
012
~~~

@@ref id="fl-try-catch" cat="D" title="try, catch и обработка исключений" cs="1.0" cx="O(1)" mem="O(1)" tags="try catch исключение Exception обработка ошибок StackTrace иерархия catch порядок catch (Exception) проглатывание" topic="p1-exceptions" related="fl-finally,fl-filters,fl-rethrow,fl-exception-cost" learn="dotnet/csharp/language-reference/statements/exception-handling-statements::Операторы обработки исключений"
Исключение — объект, описывающий ошибку; оно «всплывает» вверх по стеку вызовов, пока его не перехватит подходящий блок `catch`, иначе процесс завершается.

## Синтаксис {#syntax}

~~~csharp @nocheck
try { Risky(); }
catch (FileNotFoundException e) { Log(e.Message); }
catch (IOException) { ... }
catch (Exception e) when (e is not OperationCanceledException) { ... }
finally { Cleanup(); }
~~~

## Семантика {#semantics}

- Блоки `catch` проверяются **сверху вниз**; срабатывает первый, чей тип совпадает или является базовым. Более общий тип должен идти ниже частного, иначе ошибка компиляции CS0160.
- `catch` без типа перехватывает всё; `catch (Exception e)` — все управляемые исключения. Ловите конкретные типы, которые умеете обработать.
- Исключение — объект, у которого есть `Message`, `StackTrace`, `InnerException`, `Data`, `HResult`. `ToString()` печатает всё вместе со стеком.
- Выброс исключения — исключительная ситуация, а не способ управления потоком: для ожидаемых случаев (пустой ввод, нет файла) используйте проверки и `TryXxx`.
- Нельзя «проглатывать»: пустой `catch` скрывает ошибки. Логируйте или перебрасывайте.
- Обрабатывайте исключения на том уровне, где можно что-то сделать; в остальных местах пусть всплывают.
- Исключения не пересекают границы потоков автоматически: в `Task` они сохраняются и выбрасываются при `await`.
- Необработанное исключение завершает процесс (в ASP.NET Core — превращается в ответ 500 через middleware).
- `OutOfMemoryException`, `StackOverflowException` обработать нельзя: переполнение стека завершает процесс.
- На практике определите границы: на нижних уровнях ловите только то, что умеете исправить или обогатить контекстом, а на верхнем уровне (middleware, обработчик задач) — логируйте и превращайте в ответ. Не используйте возвращаемое значение `-1` вместо исключения, если вызывающий легко забудет его проверить.

## Под капотом {#internals}

Таблицы обработчиков хранятся в метаданных метода. Исключение проходит двухфазную обработку: сначала ищется подходящий обработчик (фильтры выполняются), затем стек раскручивается и выполняются `finally`. Захват стека делает выброс дорогим.

## Сложность {#complexity}

Блок `try` без исключения почти бесплатен. Выброс и перехват стоят десятки микросекунд — на три порядка дороже обычной ветки ([стоимость](#/ref/d/fl-exception-cost)).

## Версии {#versions}

- C# 1.0 — `try/catch/finally`; C# 6 — фильтры `when`.
- C# 7 — `throw`-выражения; .NET 6+ — `ArgumentNullException.ThrowIfNull`.

## Ловушки {#pitfalls}

**Порядок блоков и проглатывание.**

~~~csharp
try { int.Parse("abc"); }
catch (FormatException e) { Console.WriteLine("формат: " + e.GetType().Name); }
catch (Exception) { Console.WriteLine("другое"); }

try { var a = new int[2]; _ = a[int.Parse("5")]; }
catch { /* ❌ пустой catch скрывает ошибку */ }

try { Console.WriteLine(10 / int.Parse("0")); }
catch (DivideByZeroException) { Console.WriteLine("деление на ноль"); }
~~~
~~~console
формат: FormatException
деление на ноль
~~~

**`catch (Exception)` на верхнем уровне библиотеки** скрывает ошибки программиста.

**Потеря стека** из-за `throw e;` ([переброс](#/ref/d/fl-rethrow)).

**Исключения для потока управления:** `int.Parse` в цикле вместо `TryParse`.

## Примеры {#examples}

~~~csharp
foreach (var s in new[] { "12", "x", "" })
{
    try { Console.WriteLine(int.Parse(s) * 2); }
    catch (FormatException) { Console.WriteLine($"«{s}» не число"); }
}

if (int.TryParse("77", out var v)) Console.WriteLine(v);

try { object o = "s"; _ = (int)o; }
catch (InvalidCastException e) { Console.WriteLine(e.GetType().Name); }
~~~
~~~console
24
«x» не число
«» не число
77
InvalidCastException
~~~

@@ref id="fl-finally" cat="D" title="finally и гарантированная очистка" cs="1.0" cx="O(1)" mem="O(1)" tags="finally try finally очистка освобождение ресурсов return в finally using порядок выполнения" topic="p1-exceptions" related="fl-try-catch,cl-dispose,fl-jumps" learn="dotnet/csharp/language-reference/statements/exception-handling-statements::try-finally"
Блок `finally` выполняется всегда при выходе из `try` — нормальном, через `return`/`break` или по исключению; в нём освобождают то, что нельзя оставить открытым.

## Синтаксис {#syntax}

~~~csharp @nocheck
try { ... } finally { conn.Close(); }
try { ... } catch (X) { ... } finally { ... }
using var f = File.OpenRead(p);       // сокращение для try/finally с Dispose
~~~

## Семантика {#semantics}

- Порядок: тело `try` → при исключении подходящий `catch` → `finally`. Без исключения `catch` пропускается, `finally` выполняется.
- `finally` выполняется и при `return`, `break`, `continue`, `goto` из `try`. Возвращаемое значение вычисляется **до** `finally`.
- Нельзя выйти из `finally` оператором `return`/`break`/`goto`: компилятор запрещает (CS0157).
- Если исключение возникло внутри `finally`, оно заменяет текущее исключение.
- `finally` не выполнится, если процесс аварийно завершён: `Environment.FailFast`, `StackOverflowException`, убийство процесса, выключение питания. Кроме того, при необработанном исключении без подходящего `catch` выполнение `finally` не гарантируется платформой.
- Для освобождения ресурсов предпочтительнее `using`, он сам создаёт `try/finally`.
- В `finally` нельзя использовать `await` в старых версиях C#; с C# 6 можно.
- Не помещайте в `finally` тяжёлую логику или код, способный бросить исключение.
- На практике код очистки должен быть надёжным и быстрым. Если закрытие ресурса может бросить исключение, оберните его в собственный `try/catch` внутри `finally`, чтобы не потерять первоначальную ошибку.
- Типичное применение — снятие блокировки, откат флага «занято», остановка таймера, возврат объекта в пул. Для всего остального, что реализует `IDisposable`, используйте `using`, а ручной `finally` оставляйте для действий, у которых нет объекта-ресурса. В асинхронных методах `finally` выполняется после завершения ожидания, поэтому блокировка удерживается дольше, чем кажется.
- Пишите `finally` так, чтобы он был безопасен при частично выполненном `try`: переменная могла не успеть получить значение, и обращаться к ней нужно через проверку на `null`.

## Под капотом {#internals}

Выход из `try` в IL выполняется инструкцией `leave`, которая запускает `finally`-обработчики по пути. При исключении `finally` запускается на второй фазе раскрутки стека.

## Сложность {#complexity}

Бесплатен на обычном пути; JIT дублирует код `finally` для быстрого пути.

## Версии {#versions}

- C# 1.0 — `finally`; C# 6 — `await` в `catch` и `finally`.

## Ловушки {#pitfalls}

**Значение `return` фиксируется до `finally`.**

~~~csharp
Console.WriteLine(F());
Console.WriteLine(Order());

static int F()
{
    int x = 1;
    try { return x; }                // значение 1 уже сохранено
    finally { x = 99; }              // изменение не повлияет на результат
}
static string Order()
{
    var log = "";
    try { log += "try "; throw new Exception(); }
    catch { log += "catch "; }
    finally { log += "finally"; }
    return log;
}
~~~
~~~console
1
try catch finally
~~~

**Исключение в `finally`** затирает исходное.

**Закрытие ресурса вручную** вместо `using` — забытый `Close` при раннем `return`.

**Надежда на `finally` при `Environment.Exit`.**

## Примеры {#examples}

~~~csharp
try
{
    Console.WriteLine("работаем");
    throw new InvalidOperationException("сбой");
}
catch (InvalidOperationException e)
{
    Console.WriteLine("поймали: " + e.Message);
}
finally
{
    Console.WriteLine("очистка");
}
~~~
~~~console
работаем
поймали: сбой
очистка
~~~

@@ref id="fl-filters" cat="D" title="Фильтры исключений when" cs="6.0" cx="O(1)" mem="O(1)" tags="when фильтр исключений exception filter catch when логирование стек без раскрутки" topic="p1-exceptions" related="fl-try-catch,fl-rethrow,op-logical" learn="dotnet/csharp/language-reference/statements/exception-handling-statements::Фильтры исключений"
Фильтр `catch (E e) when (условие)` решает, перехватывать ли исключение, **не раскручивая стек**: если условие ложно, исключение идёт дальше как будто блока нет.

## Синтаксис {#syntax}

~~~csharp @nocheck
try { ... }
catch (HttpRequestException e) when (e.StatusCode == HttpStatusCode.NotFound) { ... }
catch (Exception e) when (Log(e)) { }      // Log возвращает false: только логирование
~~~

## Семантика {#semantics}

- Условие `when` вычисляется на первой фазе обработки, **до** выполнения `finally` внутренних блоков. Стек на этот момент ещё цел, поэтому отладчик показывает место возникновения.
- Если фильтр вернул `false`, поиск обработчика продолжается выше, а текущий `catch` пропускается.
- Исключение внутри самого фильтра подавляется, фильтр считается ложным — не бросайте исключений в `when`.
- Фильтры хороши для: разных реакций на один тип по значению свойства (код ошибки), логирования без перехвата (`when (Log(e))` с возвратом `false`), исключения отмены (`when (e is not OperationCanceledException)`).
- Можно использовать переменные из области видимости метода, но избегайте побочных эффектов.
- Фильтр заменяет паттерн «поймать, проверить, перебросить через `throw;`», сохраняя точку возникновения.
- Несколько `catch` с одним типом и разными `when` проверяются сверху вниз.
- Фильтры дешёвые, но они выполняются в неполной области стека, поэтому не делайте в них долгих операций.
- На практике фильтр удобен для «шумных» ситуаций: можно логировать каждое исключение в `when`, возвращая `false`, и не менять поведение обработки. В отладчике это сохраняет полную картину стека в момент ошибки.
- Фильтр не заменяет проверку аргументов: не используйте его, чтобы скрыть плохой дизайн, при котором исключение выбрасывается ради ветвления. Если одно и то же условие повторяется в нескольких `catch`, вынесите его в статический метод с понятным именем и вызывайте из `when`; такой метод легко покрыть тестами.

## Под капотом {#internals}

В IL фильтр — отдельный блок `filter`, которому среда выполнения передаёт исключение и ждёт 0 или 1. Поэтому обработчики `finally` внутренних кадров запускаются уже после фильтра.

## Сложность {#complexity}

Вычисление условия — `O(1)`; сам выброс остаётся дорогим.

## Версии {#versions}

- C# 6 — фильтры исключений `when` (в IL существовали с версии 1.0).
- VB.NET поддерживал фильтры раньше C#.

## Ловушки {#pitfalls}

**Фильтр, возвращающий `false`, не мешает цепочке.**

~~~csharp
try
{
    try { throw new InvalidOperationException("код 404"); }
    catch (InvalidOperationException e) when (e.Message.Contains("500"))
    { Console.WriteLine("внутренний"); }
}
catch (InvalidOperationException e) when (Trace(e))
{ Console.WriteLine("внешний: " + e.Message); }

static bool Trace(Exception e) { Console.WriteLine("лог: " + e.GetType().Name); return true; }
~~~
~~~console
лог: InvalidOperationException
внешний: код 404
~~~

**Побочные эффекты и долгие операции в `when`.**

**Ошибка внутри фильтра** молча делает его ложным.

**Использование для ветвления обычной логики** вместо проверок.

## Примеры {#examples}

~~~csharp
foreach (var code in new[] { 404, 500, 418 })
{
    try { throw new HttpFail(code); }
    catch (HttpFail e) when (e.Code == 404) { Console.WriteLine("не найдено"); }
    catch (HttpFail e) when (e.Code >= 500) { Console.WriteLine("сервер"); }
    catch (HttpFail e) { Console.WriteLine("прочее " + e.Code); }
}

class HttpFail(int code) : Exception { public int Code => code; }
~~~
~~~console
не найдено
сервер
прочее 418
~~~
