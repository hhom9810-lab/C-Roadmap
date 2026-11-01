@@append id="p1-runtime"
## Закрепление: проверь, что понял {#lab}

:::quiz Рантайм: IL, JIT, GC
? Что хранится в `.dll`, который выдал компилятор C#? #net
- Машинный код под текущий процессор
+ Промежуточный язык IL и метаданные
- Исходный код C#, упакованный в архив
- Байткод JVM
= Компилятор C# (Roslyn) выпускает IL + метаданные. В машинный код его превращает JIT-компилятор CLR во время выполнения (или AOT/ReadyToRun заранее).

? Когда объект становится кандидатом на сборку мусора? #memory
- Когда выходит из области видимости блок `{ }`
- Когда у него вызван `Dispose()`
+ Когда он недостижим ни из одного корня (стек, статики, регистры)
- Когда прошло 10 секунд после создания
= GC работает по достижимости из корней, а не по областям видимости. `Dispose` освобождает ресурсы, но не память объекта.

? Почему вызывать `GC.Collect()` вручную — обычно плохая идея? #net
- Он не работает в Release
+ Он провоцирует лишние паузы и продвигает объекты в старшие поколения, GC и так знает лучше
- Он удаляет статические поля
- Он требует прав администратора
= Ручной `GC.Collect()` — признак того, что проблему памяти ищут не там. Профилируй аллокации и утечки.
:::

:::viz gc
:::

:::cards Рантайм
IL :: Промежуточный язык, в который компилируется C#; JIT превращает его в машинный код.
JIT :: Just-In-Time компилятор CLR: компилирует IL в машинный код при первом вызове метода.
CLR :: Common Language Runtime — среда выполнения: JIT, GC, загрузка сборок, исключения, типобезопасность.
Поколения GC :: Gen 0 (новые), Gen 1 (буфер), Gen 2 (долгожители) + LOH для больших (≥ 85 000 байт) объектов.
Корни GC :: Локальные переменные в стеке, статические поля, регистры, GC-handle — всё, от чего считается достижимость.
:::


@@append id="p1-syntax"
## Закрепление: решай и запускай {#lab}

:::quiz Синтаксис и числа
? Что выведет `Console.WriteLine(7 / 2 * 2.0);`? #lang
- 7
- 3.5
+ 6
- 7.0
= `7 / 2` — целочисленное деление = 3, потом `3 * 2.0` = 6 (double выведется как `6`). Порядок операций и типы важны.

? Что произойдёт в `int x = int.MaxValue; x++;` в обычном (unchecked) контексте? #lang
- OverflowException
+ Значение «перевернётся» в int.MinValue
- Компилятор не даст скомпилировать
- x останется равным int.MaxValue
= По умолчанию целочисленное переполнение молча заворачивается. `checked { }` или `<CheckForOverflowUnderflow>` превращает его в исключение.

? Почему `0.1 + 0.2 == 0.3` вычисляется как `false`? #lang
- Это баг компилятора
- Потому что 0.1 — это decimal
+ Двоичная плавающая точка не может точно представить 0.1 и 0.2
- Потому что `==` для double всегда false
= double — двоичная дробь. Для денег — `decimal`, для сравнения double — допуск (`Math.Abs(a-b) < eps`).

? Что делает `switch` в C`#` по умолчанию, если в секции `case` нет `break`/`return`? #lang
- Проваливается в следующий case, как в C
+ Не компилируется (CS0163): «провалов» нет
- Выполняет следующий case молча
- Выбрасывает исключение
= В C# каждая секция обязана завершаться `break`, `return`, `throw` и т.п. Исключение — несколько меток подряд на одну секцию.
:::

:::ide Сумма цифр без строк
@xp 40
@task
Реализуй `Solver.DigitSum(int n)` — сумму цифр числа (для отрицательных — по модулю). **Строки использовать нельзя**: только арифметика (`%` и `/`).
@code
~~~csharp
using System;

public static class Solver
{
    public static int DigitSum(int n)
    {
        // TODO: пока возвращаем заглушку
        return 0;
    }
}

class Program
{
    static void Main() => Console.WriteLine(Solver.DigitSum(1234));
}
~~~
@tests
~~~csharp
class T
{
    public static void Run()
    {
        Assert.Equal(0, Solver.DigitSum(0), "0 → 0");
        Assert.Equal(6, Solver.DigitSum(123), "123 → 6");
        Assert.Equal(9, Solver.DigitSum(-45), "-45 → 9");
        Assert.Equal(46, Solver.DigitSum(int.MaxValue), "int.MaxValue → 46");
    }
}
~~~
@forbid ToString|string|Convert|ToCharArray|\.Parse => Условие: без строк — только арифметика
@hint
Последняя цифра — это `n % 10`, остальное — `n / 10`. Повторяй, пока n не станет 0.
@hint
Отрицательные: возьми модуль. Осторожно с `int.MinValue` — у него нет положительного двойника в int; для нашей задачи достаточно `long`-копии или обработки знака в цикле.
@solution
~~~csharp
public static class Solver
{
    public static int DigitSum(int n)
    {
        long v = Math.Abs((long)n);
        int sum = 0;
        while (v > 0)
        {
            sum += (int)(v % 10);
            v /= 10;
        }
        return sum;
    }
}
~~~
@why
Цикл с делением на 10 — базовый приём. Бонус внимательности: `Math.Abs(int.MinValue)` бросает `OverflowException`, поэтому мы расширяем до `long`.
:::

:::compare Вложенность: «лесенка» против guard clauses
@intro Одинаковое поведение — разная читаемость. Нажми «Запустить оба» и сравни оценку ревью.
@bad
~~~csharp
using System;
static string Check(int age, bool hasTicket, bool banned)
{
    string result;
    if (!banned)
    {
        if (hasTicket)
        {
            if (age >= 18)
            {
                if (age < 65) { result = "Проходи"; }
                else { result = "Льготный вход"; }
            }
            else { result = "Только с родителями"; }
        }
        else { result = "Нет билета"; }
    }
    else { result = "Вход запрещён"; }
    return result;
}
Console.WriteLine(Check(30, true, false));
Console.WriteLine(Check(70, true, false));
Console.WriteLine(Check(15, true, false));
Console.WriteLine(Check(30, false, false));
Console.WriteLine(Check(30, true, true));
~~~
@badwhy
Четыре уровня вложенности: чтобы понять, когда сработает `"Проходи"`, нужно держать в голове все четыре условия, а «хвосты» `else` разбросаны далеко от своих `if`.
@good
~~~csharp
using System;
static string Check(int age, bool hasTicket, bool banned)
{
    if (banned) return "Вход запрещён";
    if (!hasTicket) return "Нет билета";
    if (age < 18) return "Только с родителями";
    if (age >= 65) return "Льготный вход";
    return "Проходи";
}
Console.WriteLine(Check(30, true, false));
Console.WriteLine(Check(70, true, false));
Console.WriteLine(Check(15, true, false));
Console.WriteLine(Check(30, false, false));
Console.WriteLine(Check(30, true, true));
~~~
@goodwhy
**Guard clauses**: сначала отсекаем исключительные случаи ранним `return`, «счастливый путь» остаётся в конце без отступов. Каждое условие читается отдельно.
@run
:::

:::cards Синтаксис
Целочисленное деление :: `7 / 2 == 3` — дробная часть отбрасывается; чтобы получить дробь, хотя бы один операнд должен быть double/decimal.
Переполнение int :: В unchecked-контексте молча заворачивается; `checked` бросает OverflowException.
decimal vs double :: decimal — десятичная дробь для денег (точно); double — двоичная, быстрая, с ошибками округления.
Guard clause :: Ранний return/continue для исключительных случаев, чтобы основной код не уезжал вправо.
switch в C# :: Секция должна завершаться break/return/throw — «проваливания» нет.
:::


@@append id="p1-types"
## Закрепление: память своими руками {#lab}

:::viz heap
:::

:::quiz Value vs reference
? Что выведет код? #memory
| var a = new int[] { 1, 2, 3 };
| var b = a;
| b[0] = 99;
| Console.WriteLine(a[0]);
- 1
+ 99
- 0
- Ошибка компиляции
= Массив — ссылочный тип. `b = a` копирует ссылку, а не данные, поэтому оба указывают на один массив.

? Что выведет код? #memory
| struct P { public int X; }
| var list = new List<P> { new P { X = 1 } };
| var p = list[0];
| p.X = 5;
| Console.WriteLine(list[0].X);
+ 1
- 5
- 0
- Ошибка компиляции
= Индексатор возвращает **копию** структуры. Изменили копию — в списке ничего не поменялось. (А `list[0].X = 5` компилятор вообще запретит: CS1612.)

? Что здесь хранится в куче? #memory
| void M() { int n = 5; var s = "hi"; var o = new object(); }
- n, s и o
- Только n
+ Строка "hi" и объект o (в стеке — только ссылки s и o, и значение n)
- Ничего: всё в стеке
= Значение `n` лежит в кадре стека. Переменные `s` и `o` — ссылки в стеке, а объекты, на которые они указывают, — в управляемой куче.

? Чем `==` для ссылочных типов без перегрузки отличается от `.Equals`? #oop
- Ничем
+ `==` сравнивает ссылки, а `.Equals` по умолчанию — тоже ссылки, но его можно переопределить для сравнения по значению
- `==` сравнивает поля
- `.Equals` всегда сравнивает по значению
= Оператор `==` для классов по умолчанию — ссылочное равенство. `string` и `record` переопределяют равенство по значению.
:::

:::ticket Баланс не обновляется после начисления процентов
@key BANK-101
@type Bug
@prio High
@reporter Ольга (QA)
@labels struct, баг
@xp 70
@task
**Шаги:** вызываем `ApplyInterest` для списка счетов — в консоль выводится новый баланс, но в `List<Account>` суммы остались прежними.

Ожидается: после `Solver.ApplyInterest(accounts, 10)` баланс каждого счёта увеличен на 10 %. `Account` — структура, её менять нельзя (она лежит в общей библиотеке и используется в десятках мест).
@comment Ольга (QA): На проде видела в логе правильные цифры, а в отчёте — старые.
@comment Макс (TL): Подумай, что возвращает индексатор списка для struct. Подсказка: «изменяем копию».
@code
~~~csharp
using System;
using System.Collections.Generic;

public struct Account
{
    public string Owner;
    public decimal Balance;
}

public static class Solver
{
    public static void ApplyInterest(List<Account> accounts, decimal percent)
    {
        foreach (var acc in accounts)
        {
            var copy = acc;
            copy.Balance += copy.Balance * percent / 100m;
        }
    }
}

class Program
{
    static void Main()
    {
        var list = new List<Account> { new Account { Owner = "Аня", Balance = 100m } };
        Solver.ApplyInterest(list, 10m);
        Console.WriteLine(list[0].Balance);
    }
}
~~~
@tests
~~~csharp
class T
{
    public static void Run()
    {
        var list = new List<Account>
        {
            new Account { Owner = "A", Balance = 100m },
            new Account { Owner = "B", Balance = 250m }
        };
        Solver.ApplyInterest(list, 10m);
        Assert.Equal(110m, list[0].Balance, "A: 100 → 110");
        Assert.Equal(275m, list[1].Balance, "B: 250 → 275");
        Assert.Equal("A", list[0].Owner, "Owner не потерян");
    }
}
~~~
@require for\s*\( => Нужен индексный цикл: foreach не даёт изменить элемент списка структур
@hint
`foreach` и индексатор `list[i]` отдают **копию** структуры. Чтобы сохранить изменения, нужно положить изменённую копию обратно: `list[i] = copy;`.
@hint
Цикл `for (int i = 0; i < accounts.Count; i++) { var a = accounts[i]; a.Balance += ...; accounts[i] = a; }`.
@solution
~~~csharp
using System;
using System.Collections.Generic;

public struct Account
{
    public string Owner;
    public decimal Balance;
}

public static class Solver
{
    public static void ApplyInterest(List<Account> accounts, decimal percent)
    {
        for (int i = 0; i < accounts.Count; i++)
        {
            var a = accounts[i];
            a.Balance += a.Balance * percent / 100m;
            accounts[i] = a;
        }
    }
}
~~~
@why
Мораль: структура — **значение**. Изменил копию — оригинал цел. Варианты лечения: записать копию обратно (как здесь), сделать `Account` классом/`record`, или сделать структуру неизменяемой с методом `WithBalance(...)` — тогда ошибка просто не скомпилируется.
:::

:::cards Value vs reference
Где живёт struct-поле класса :: Внутри объекта класса в куче — данные структуры лежат «на месте».
Что копируется при передаче struct в метод :: Все данные (копия значения). Для класса — только ссылка.
Что возвращает индексатор List<struct> :: Копию элемента — изменения копии не затрагивают список.
Кто хранится в стеке :: Кадры методов: локальные значимые типы и ссылки на объекты (но не сами объекты).
Что такое NullReferenceException :: Обращение через ссылку, которая указывает в никуда (null).
:::


@@append id="p1-boxing"
## Закрепление: найди скрытые аллокации {#lab}

:::viz heap boxing
:::

:::quiz Боксинг
? Какая строка вызывает боксинг? #memory
| int n = 5;
| // A:
| object o = n;
| // B:
| long l = n;
| // C:
| int m = n + 1;
| // D:
| var s = n.ToString();
- B
- C
+ A
- D
= Приведение значимого типа к `object` (или к интерфейсу) упаковывает значение в объект в куче. `long l = n` — просто расширение числа.

? Что вызовет `InvalidCastException`? #net
| object o = 42;
- `int x = (int)o;`
- `long x = Convert.ToInt64(o);`
+ `long x = (long)o;`
- `var x = o.ToString();`
= Распаковывать можно **только в точный тип**, который лежит в коробке: там `int`, а не `long`. Правильно: `(long)(int)o`.

? Почему `List<object>` с числами — плохая идея для производительности? #net
- Из-за синхронизации
- Потому что object нельзя сравнивать
+ Каждое число упаковывается в отдельный объект в куче + лишний проход GC
- Потому что List<object> не масштабируется
= Дженерик `List<int>` хранит числа подряд без обёрток. Боксинг — аллокация на каждый элемент + давление на GC.
:::

:::compare Боксинг в горячем коде
@intro Сумма чисел в «универсальной» коллекции против типизированной.
@bad
~~~csharp
using System;
using System.Collections;
var list = new ArrayList();
for (int i = 0; i < 5; i++) list.Add(i);
long sum = 0;
foreach (object o in list) sum += (int)o;
Console.WriteLine(sum);
~~~
@badwhy
`ArrayList` хранит `object`: каждое `Add(i)` упаковывает число в новый объект, а `(int)o` его распаковывает. Для миллионов элементов — миллионы лишних аллокаций.
@good
~~~csharp
using System;
using System.Collections.Generic;
var list = new List<int>();
for (int i = 0; i < 5; i++) list.Add(i);
long sum = 0;
foreach (int n in list) sum += n;
Console.WriteLine(sum);
~~~
@goodwhy
`List<int>` — дженерик над значимым типом: числа лежат подряд в массиве `int[]`, без упаковки и приведений типа.
@run
:::

:::interview Боксинг и равенство
@q Что выведет `object a = 5; object b = 5; Console.WriteLine(a == b);` и `Console.WriteLine(a.Equals(b));`?
@trap Видит ли кандидат, что каждое присваивание значимого типа в `object` создаёт **новую коробку**, а `==` для object — ссылочное сравнение.
@answer
Первое — `False`: это две разные коробки, и `==` сравнивает ссылки. Второе — `True`: `Int32.Equals` сравнивает значения. Ещё в этом коде компилятор покажет предупреждение о возможном ссылочном сравнении. Для чисел используй типизированные переменные, и боксинга не будет.
@fail «True, потому что 5 равно 5» — ответ про значения, а не про ссылки и коробки.
@follow Изменится ли ответ для `object a = "x"; object b = "x";`? (Литералы интернируются — одна ссылка, `True`.)
:::

:::cards Боксинг
Boxing :: Упаковка значимого типа в объект в куче (приведение к object или интерфейсу). Это аллокация.
Unboxing :: Распаковка: проверка типа + копирование значения из коробки. Только в точный исходный тип.
Как избежать боксинга :: Дженерики (List<int>), ограничения where T : struct, интерфейсы через дженерики, отказ от object-коллекций.
Скрытый боксинг :: string.Format/интерполяция с числами в старом коде, неоптимальные интерфейсные вызовы struct, ArrayList, Hashtable.
:::


@@append id="p1-methods"
## Закрепление {#lab}

:::quiz Методы и параметры
? Чем `out` отличается от `ref`? #lang
- Ничем
+ `out` не требует инициализации до вызова, но метод обязан присвоить значение; `ref` требует инициализированной переменной
- `out` работает только со структурами
- `ref` нельзя использовать с классами
= `ref` — «передать по ссылке, изменяемо». `out` — «метод вернёт значение через параметр»: до вызова переменная может быть не инициализирована, после метода — обязана быть присвоена.

? Какая перегрузка вызовется? #lang
| static void F(int x) => Console.WriteLine("int");
| static void F(long x) => Console.WriteLine("long");
| static void F(double x) => Console.WriteLine("double");
| F(5);
+ int
- long
- double
- Неоднозначность, ошибка
= Выбирается наиболее подходящая перегрузка: точное совпадение типа лучше любых неявных преобразований.

? Что даёт модификатор `in`? #lang
- Позволяет изменять аргумент
+ Передаёт аргумент по ссылке только для чтения — без копирования большой структуры
- Делает параметр необязательным
- Включает боксинг
= `in` — «по ссылке, но неизменяемо». Полезен для больших `readonly struct`, чтобы избежать копий.
:::

:::ide TryParse по-взрослому
@xp 45
@task
Реализуй `Solver.TryParsePositive(string s, out int value)`. Возвращает `true`, только если строка — целое число **больше нуля**; тогда `value` — это число. Иначе — `false`, а `value = 0`. Исключений быть не должно, `int.Parse` использовать нельзя (бросает исключения на мусоре).
@code
~~~csharp
using System;

public static class Solver
{
    public static bool TryParsePositive(string s, out int value)
    {
        // TODO
        value = 0;
        return false;
    }
}

class Program
{
    static void Main()
    {
        Console.WriteLine(Solver.TryParsePositive("42", out var n) + " " + n);
    }
}
~~~
@tests
~~~csharp
class T
{
    public static void Run()
    {
        int v;
        Assert.True(Solver.TryParsePositive("42", out v), "42 — валидно");
        Assert.Equal(42, v, "value = 42");
        Assert.False(Solver.TryParsePositive("-5", out v), "-5 — не положительное");
        Assert.Equal(0, v, "при неудаче value = 0");
        Assert.False(Solver.TryParsePositive("abc", out v), "abc — мусор");
        Assert.False(Solver.TryParsePositive(null, out v), "null — не падаем");
        Assert.False(Solver.TryParsePositive("0", out v), "0 — не положительное");
        Assert.False(Solver.TryParsePositive("", out v), "пустая строка");
    }
}
~~~
@forbid int\.Parse|Convert\.ToInt => Исключения на штатной ситуации — нельзя. Используй TryParse
@hint
Есть готовый `int.TryParse(s, out var n)`. Он сам вернёт `false` на `null` и мусоре.
@solution
~~~csharp
public static class Solver
{
    public static bool TryParsePositive(string s, out int value)
    {
        if (int.TryParse(s, out var n) && n > 0)
        {
            value = n;
            return true;
        }
        value = 0;
        return false;
    }
}
~~~
@why
Паттерн `Try…`: возвращаем `bool`, результат — через `out`. Штатная ситуация («пользователь ввёл ерунду») не должна быть исключением: оно дорого и шумно.
:::

:::cards Методы
out vs ref :: out: не нужно инициализировать до вызова, метод обязан присвоить. ref: нужна инициализированная переменная.
in :: Передача по ссылке только для чтения — экономит копирование больших структур.
Паттерн TryXxx :: bool-результат + out-значение вместо исключения для ожидаемых сбоев.
params :: Позволяет передать переменное число аргументов массивом: `Sum(params int[] xs)`.
:::
