@@page id="p1-exceptions" phase="1" kind="topic" title="Исключения: контракты, а не управление потоком" nav="Исключения" est="4–5 дней"
:::why
Исключения — механизм, которым код сообщает: «контракт нарушен, продолжать нельзя». Джуны чаще всего ошибаются в двух крайностях: глотают всё через `catch (Exception) { }` или используют исключения вместо `if`. На собеседовании спросят разницу `throw` и `throw ex` и «когда создавать своё исключение». В банковском проекте это **обязательная часть**.
:::

## Зачем это нужно

Любая программа рано или поздно сталкивается с ситуациями, которые нельзя предусмотреть заранее или нельзя обработать на месте: файл пропал, диск заполнен, сеть отвалилась, пользователь передал отрицательную сумму, база вернула не то. Нужен способ сказать: «**здесь не получилось, подробности такие-то**» и передать эту новость наверх — туда, где известно, что делать (показать сообщение, повторить, откатить транзакцию).

Раньше (в C и старых API) использовали коды возврата: `-1`, `null`, `false`. Их легко не проверить, а проверять приходится после каждого вызова. Исключения решают проблему иначе: **ошибку невозможно «не заметить»** — если никто не обработал, программа громко остановится, а не продолжит работать с испорченными данными. Обработка собирается в одном месте, а не размазывается по каждой строке.

Но у исключений есть цена и обязанности:

- они дорогие (в тысячи раз дороже обычной проверки `if`);
- неправильный `catch` прячет баги или ломает диагностику;
- «исключения вместо `if`» делают код запутанным и медленным.

Поэтому в работе важно уметь три вещи: (1) бросать исключения осмысленно — по нарушению контракта; (2) ловить их на границах, где можно что-то сделать; (3) не терять информацию об ошибке. На собеседованиях эту тему спрашивают всегда: `throw` против `throw ex`, `finally`, свои исключения, `using`, «когда ловить, а когда нет».

## Интуиция и аналогия

Представь цех с конвейером. Рабочий на станке замечает, что деталь бракованная и продолжать нельзя. Он не может сам решить, что делать с партией — не его уровень. Он дёргает **красный шнур**: конвейер останавливается, сигнал уходит вверх по цепочке начальников. Мастер участка смотрит: «Это знакомый брак, заменю деталь» — и обрабатывает. Если мастер не знает, что делать, сигнал идёт выше — к директору. Если не знает никто — завод останавливается целиком (необработанное исключение).

- **`throw`** — дёрнуть шнур;
- **`catch`** — «я знаю, что делать с такой ситуацией»;
- **`finally`** — «что бы ни случилось, выключить станок и убрать инструмент» (освободить ресурсы);
- **цепочка вызовов** — иерархия начальников; сигнал идёт по ней снизу вверх.

И два правила здравого смысла: не дёргать красный шнур из-за пустяков (например, посетитель ввёл не тот номер — это не авария, а обычный случай, который обрабатывается на месте), и не отключать шнур вообще (`catch {}` — «чтобы не мешал»), иначе первый серьёзный брак пройдёт незамеченным.

## Основная теория по шагам

### Шаг 1. Механика: `try` / `catch` / `finally`

~~~csharp
try
{
    Console.WriteLine("1. до ошибки");
    int[] data = { 1, 2, 3 };
    Console.WriteLine(data[10]);              // бросает IndexOutOfRangeException
    Console.WriteLine("не выполнится");
}
catch (IndexOutOfRangeException ex)           // от частного...
{
    Console.WriteLine($"2. поймали: {ex.Message}");
}
catch (Exception ex)                          // ...к общему; обратный порядок — ошибка компиляции
{
    Console.WriteLine($"неожиданная ошибка: {ex.GetType().Name}");
}
finally
{
    Console.WriteLine("3. finally выполняется всегда");
}
~~~
~~~console
1. до ошибки
2. поймали: Index was outside the bounds of the array.
3. finally выполняется всегда
~~~

- Брошенное исключение раскручивает стек вызовов, пока не найдёт подходящий `catch`. Если не найдёт — процесс завершается.
- Блоки `catch` проверяются **по порядку**: первым должен идти самый частный тип.
- `finally` выполняется и при нормальном выходе, и при исключении, и при `return` внутри `try`. Не выполнится только при аварийном завершении процесса (например, `Environment.FailFast` или переполнение стека).

Исключение — это объект. У него есть полезные свойства:

| Свойство | Что даёт |
|---|---|
| `Message` | человекочитаемое описание |
| `StackTrace` | где произошло (цепочка вызовов) |
| `InnerException` | исходная причина, если это «обёртка» |
| `GetType().Name` | точный тип |
| `Data` | произвольные дополнительные сведения |
| `ToString()` | **всё сразу**: тип, сообщение, внутренние исключения и стек — используй для логов |

Все исключения наследуют `System.Exception`. Иерархия имеет смысл: чем «специфичнее» тип, тем точнее информация.

~~~csharp
Type? t = typeof(FileNotFoundException);
while (t is not null)
{
    Console.WriteLine(t.Name);
    t = t.BaseType;
}
~~~
~~~console
FileNotFoundException
IOException
SystemException
Exception
Object
~~~

`finally` и `return` взаимодействуют предсказуемо: сначала вычисляется возвращаемое значение, потом выполняется `finally`, потом метод возвращает результат.

~~~csharp
Console.WriteLine($"результат: {F()}");

static int F()
{
    try
    {
        Console.WriteLine("try: вычисляем результат");
        return 42;
    }
    finally
    {
        Console.WriteLine("finally: выполняется перед выходом");
    }
}
~~~
~~~console
try: вычисляем результат
finally: выполняется перед выходом
результат: 42
~~~

Бросать из `finally` или выходить из него через `return` нельзя (это скрывает исходную ошибку; для `return` — ошибка компиляции).

### Шаг 2. `using` = `try/finally` для ресурсов

~~~csharp @nocheck
using (var writer = new StreamWriter("log.txt"))
{
    writer.WriteLine("операция");
}   // здесь вызовется writer.Dispose(), даже если внутри было исключение

// Короткая форма (C# 8+): Dispose в конце текущего блока
using var reader = new StreamReader("log.txt");
Console.WriteLine(reader.ReadToEnd());
~~~

Компилятор превращает `using` в `try { ... } finally { writer.Dispose(); }`. Это и есть ответ на вопрос из [темы про запуск кода](#p1-runtime): GC не закрывает файлы, их закрывает `Dispose`. Проверим, что `Dispose` вызывается и при исключении:

~~~csharp
try
{
    using var r = new Res("соединение");
    Console.WriteLine("внутри using");
    throw new InvalidOperationException("сбой");
}
catch (InvalidOperationException e)
{
    Console.WriteLine($"поймали: {e.Message}");
}

class Res(string name) : IDisposable
{
    public void Dispose() => Console.WriteLine($"{name}: закрыто");
}
~~~
~~~console
внутри using
соединение: закрыто
поймали: сбой
~~~

Обрати внимание на порядок: ресурс закрыт **до** того, как отработал `catch` — стек уже раскручен.

### Шаг 3. `throw;` против `throw ex;`

~~~csharp @nocheck
try
{
    LoadAccounts();
}
catch (IOException ex)
{
    Console.Error.WriteLine($"Не удалось прочитать файл: {ex.Message}");
    throw;        // ✅ пробрасывает ТО ЖЕ исключение с исходным стеком вызовов
    // throw ex;  // ❌ стек перезаписывается: теряется, где на самом деле произошла ошибка
}

static void LoadAccounts() => throw new IOException("диск недоступен");
~~~

Разница видна в `StackTrace`:

~~~csharp
using System.Runtime.CompilerServices;

try { Demo.RethrowGood(); }
catch (Exception e) { Console.WriteLine("throw;     → в стеке есть место ошибки: " + e.StackTrace!.Contains("DiskFailure")); }

try { Demo.RethrowBad(); }
catch (Exception e) { Console.WriteLine("throw ex;  → в стеке есть место ошибки: " + e.StackTrace!.Contains("DiskFailure")); }

static class Demo
{
    [MethodImpl(MethodImplOptions.NoInlining)]
    static void DiskFailure() => throw new IOException("диск недоступен");

    [MethodImpl(MethodImplOptions.NoInlining)]
    public static void RethrowGood() { try { DiskFailure(); } catch (IOException) { throw; } }

    [MethodImpl(MethodImplOptions.NoInlining)]
    public static void RethrowBad() { try { DiskFailure(); } catch (IOException ex) { throw ex; } }
}
~~~
~~~console
throw;     → в стеке есть место ошибки: True
throw ex;  → в стеке есть место ошибки: False
~~~

Если нужно добавить контекст — оборачивай, передавая исходное исключение как `innerException`:

~~~csharp
try
{
    ParseLine(7, "abc");
}
catch (DataFileCorruptedException e)
{
    Console.WriteLine(e.Message);
    Console.WriteLine($"причина: {e.InnerException!.GetType().Name}: {e.InnerException.Message}");
}

static void ParseLine(int lineNumber, string text)
{
    try { _ = int.Parse(text); }
    catch (FormatException ex)
    {
        throw new DataFileCorruptedException($"Строка {lineNumber}: неверный формат", ex);
    }
}

class DataFileCorruptedException(string message, Exception inner) : Exception(message, inner);
~~~
~~~console
Строка 7: неверный формат
причина: FormatException: The input string 'abc' was not in a correct format.
~~~

### Шаг 4. Фильтры исключений `when`

~~~csharp @nocheck
try
{
    File.ReadAllText(path);
}
catch (IOException ex) when (ex is FileNotFoundException || ex is DirectoryNotFoundException)
{
    Console.WriteLine("Файла ещё нет — начинаем с пустого банка");
}
~~~

Фильтр проверяется **до** входа в `catch`; если он `false`, исключение летит дальше, как будто этого `catch` нет. Важное следствие: фильтр срабатывает ещё до того, как выполнятся `finally` блоки внутренних вызовов, а стек при этом **не раскручен** — удобно для диагностики.

~~~csharp
try { Inner(); }
catch (Exception) when (Log("фильтр: решаем, ловить ли"))
{
    Console.WriteLine("catch: ловим");
}

static void Inner()
{
    try { throw new Exception("сбой"); }
    finally { Console.WriteLine("finally во внутреннем методе"); }
}

static bool Log(string s) { Console.WriteLine(s); return true; }
~~~
~~~console
фильтр: решаем, ловить ли
finally во внутреннем методе
catch: ловим
~~~

Хорошее применение фильтров — ловить исключение по свойству (код ошибки), не перехватывая лишнее: `catch (ApiException e) when (e.StatusCode == 404)`.

### Шаг 5. Собственные исключения

Своё исключение нужно, когда вызывающему коду важно **отличить** эту ситуацию и, возможно, получить данные о ней.

~~~csharp
try { Bank.Withdraw("ACC-1", balance: 100m, amount: 500m); }
catch (InsufficientFundsException e)
{
    Console.WriteLine(e.Message);
    Console.WriteLine($"не хватает: {e.Requested - e.Balance}");
}

try { Bank.Find("ACC-9"); }
catch (BankException e) when (e is not InsufficientFundsException)    // общий базовый тип ловит все ошибки предметной области
{
    Console.WriteLine($"{e.GetType().Name}: {e.Message}");
}

static class Bank
{
    public static void Withdraw(string number, decimal balance, decimal amount)
    {
        if (amount > balance) throw new InsufficientFundsException(number, balance, amount);
    }

    public static void Find(string number) => throw new AccountNotFoundException(number);
}

public class BankException : Exception
{
    public BankException() { }
    public BankException(string message) : base(message) { }
    public BankException(string message, Exception inner) : base(message, inner) { }
}

public sealed class InsufficientFundsException : BankException
{
    public string AccountNumber { get; }
    public decimal Balance { get; }
    public decimal Requested { get; }

    public InsufficientFundsException(string accountNumber, decimal balance, decimal requested)
        : base($"Счёт {accountNumber}: недостаточно средств (баланс {balance:N2}, запрошено {requested:N2})")
    {
        AccountNumber = accountNumber;
        Balance = balance;
        Requested = requested;
    }
}

public sealed class AccountNotFoundException : BankException
{
    public string AccountNumber { get; }
    public AccountNotFoundException(string accountNumber)
        : base($"Счёт {accountNumber} не найден") => AccountNumber = accountNumber;
}
~~~
~~~console
Счёт ACC-1: недостаточно средств (баланс 100.00, запрошено 500.00)
не хватает: 400
AccountNotFoundException: Счёт ACC-9 не найден
~~~

- Имя заканчивается на `Exception`.
- Общая база (`BankException`) позволяет поймать **все** ошибки предметной области одним `catch`, не задевая системные.
- У базового класса есть три стандартных конструктора (рекомендация .NET). У конкретных исключений с обязательными данными разумно оставить только конструктор с этими данными.
- Данные (`Balance`, `Requested`) — для кода, сообщение — для человека.
- Не наследуйся от `ApplicationException` (устаревшая рекомендация) — только от `Exception` или своей базы.

#### Какие готовые исключения использовать

| Ситуация | Исключение |
|---|---|
| Аргумент недопустим (пустая строка, неверный формат) | `ArgumentException` |
| Аргумент `null`, а нельзя | `ArgumentNullException` (удобно: `ArgumentNullException.ThrowIfNull(x)`) |
| Число вне допустимого диапазона | `ArgumentOutOfRangeException` |
| Операция невозможна в текущем состоянии объекта | `InvalidOperationException` |
| Объект уже освобождён | `ObjectDisposedException` |
| Метод сознательно не поддерживается | `NotSupportedException` |
| Ключа нет в словаре | `KeyNotFoundException` (бросается самим словарём) |
| Ситуация предметной области, которую вызывающий должен различать | своё исключение |

А вот `NullReferenceException`, `IndexOutOfRangeException`, `InvalidCastException`, `StackOverflowException` — **признаки багов**: их не бросают сознательно и обычно не ловят, а исправляют код.

### Шаг 6. Исключение как архитектурная ошибка

:::key Главное правило
Исключение — для ситуаций, когда **метод не может выполнить своё обещание**. Ожидаемый, нормальный исход (пользователь ввёл буквы вместо числа, искомого нет в списке) — это не исключение, а ветка `if` или Try-метод.
:::

~~~csharp @nocheck
// ❌ Исключения как управление потоком: ввод неверный в половине случаев — это норма
int ReadChoiceBad()
{
    while (true)
    {
        try { return int.Parse(Console.ReadLine()!); }
        catch (FormatException) { Console.WriteLine("Введите число"); }
    }
}

// ✅ Ожидаемая ситуация — обычная проверка
int ReadChoice()
{
    while (true)
    {
        if (int.TryParse(Console.ReadLine(), out int choice)) return choice;
        Console.WriteLine("Введите число");
    }
}
~~~

Разница в цене — не теория. Измерим 2000 неверных вводов:

~~~csharp
using System.Diagnostics;

var sw = Stopwatch.StartNew();
int failed = 0;
for (int i = 0; i < 2000; i++)
{
    try { _ = int.Parse("abc"); }
    catch (FormatException) { failed++; }
}
long viaException = sw.ElapsedTicks;

sw.Restart();
for (int i = 0; i < 2000; i++)
    if (!int.TryParse("abc", out _)) failed++;
long viaTryParse = sw.ElapsedTicks;

Console.WriteLine(failed);
Console.WriteLine($"исключения медленнее TryParse более чем в 20 раз: {viaException > 20 * viaTryParse}");
~~~
~~~console
4000
исключения медленнее TryParse более чем в 20 раз: True
~~~

**А «недостаточно средств» — исключение или нет?** Зависит от слоя:

- Для метода `BankAccount.Withdraw` снятие больше баланса — **нарушение контракта**. Метод не может выполнить обещание и бросает `InsufficientFundsException`. Так доменная модель защищает инвариант, даже если вызывающий забыл проверку.
- Для **интерфейса** (консольного меню) это ожидаемая ситуация. Меню ловит `BankException` **в одном месте** и показывает сообщение. Можно также дать методы `CanWithdraw(amount)` / `TryWithdraw(...)`, чтобы UI проверял заранее.

Обработка на границе: одно место, а не try/catch вокруг каждой строки. Смоделируем меню с очередью команд вместо клавиатуры:

~~~csharp
var commands = new Queue<string>(new[] { "withdraw 50", "withdraw 500", "find 9", "boom", "exit" });

try   // это «верхний уровень программы»: сюда долетают только настоящие баги
{
    while (commands.Count > 0)
    {
        string command = commands.Dequeue();
        if (command == "exit") break;
        try
        {
            Execute(command);                    // внутри — доменная логика, бросающая BankException
        }
        catch (BankException ex)                 // ожидаемые ошибки предметной области
        {
            Console.WriteLine($"Операция отклонена: {ex.Message}");
        }
        catch (IOException ex)                   // проблемы с файлом — сообщаем, но не падаем
        {
            Console.WriteLine($"Ошибка сохранения: {ex.Message}");
        }
        // Остальные исключения (NullReferenceException и т. п.) — это БАГИ.
        // Их не глотаем: пусть программа упадёт громко, и ты исправишь код.
    }
}
catch (InvalidOperationException bug)
{
    Console.WriteLine($"БАГ вылетел наружу (в реальной программе — падение и лог): {bug.Message}");
}

static void Execute(string command)
{
    if (command.StartsWith("withdraw "))
    {
        decimal amount = decimal.Parse(command[9..]);
        if (amount > 100m) throw new InsufficientFundsException("ACC-1", 100m, amount);
        Console.WriteLine($"Снято {amount}");
    }
    else if (command.StartsWith("find ")) throw new AccountNotFoundException(command[5..]);
    else throw new InvalidOperationException("неизвестная команда — это баг в меню");
}

class BankException(string message) : Exception(message);
class InsufficientFundsException(string n, decimal b, decimal r) : BankException($"{n}: баланс {b}, запрошено {r}");
class AccountNotFoundException(string n) : BankException($"счёт {n} не найден");
~~~
~~~console
Снято 50
Операция отклонена: ACC-1: баланс 100, запрошено 500
Операция отклонена: счёт 9 не найден
БАГ вылетел наружу (в реальной программе — падение и лог): неизвестная команда — это баг в меню
~~~

Обрати внимание, что команда `boom` бросила `InvalidOperationException`, которого нет среди внутренних `catch`, — исключение пролетело мимо меню на самый верх. Это правильно: баг не должен молча «проглатываться». В настоящей программе здесь было бы падение с записью в лог (в ASP.NET Core — общий обработчик ошибок, Фаза 4).

## Как это работает под капотом

- **Таблицы вместо проверок: «нулевая цена» без исключений.** Компилятор записывает для каждого метода *таблицу регионов* `try`: «если исключение в диапазоне инструкций A–B, обработчик находится здесь». Пока исключений нет, вход в `try` ничего не стоит — никаких проверок кодов возврата в «счастливом» пути. Платишь только когда исключение действительно брошено.
- **Бросок дорогой.** `throw` создаёт объект, собирает информацию о стеке и запускает *двухфазную* раскрутку: (1) **первый проход** — по стеку вверх ищется подходящий `catch`, при этом выполняются фильтры `when`; (2) **второй проход** — стек раскручивается, выполняются `finally`-блоки внутренних кадров, управление передаётся в найденный `catch`. Порядки величин — десятки микросекунд на бросок против наносекунд на `if` (см. [таблицу стоимости](#/ref/g/pf-op-costs)); новые версии рантайма ускорили этот путь, но разница остаётся на порядки.
- **`throw;` и `throw ex;` в IL** — разные инструкции: `rethrow` (сохраняет исходный стек) и `throw` (начинает трассировку заново с текущего места). Поэтому при `throw ex` и теряется информация.
- **`finally`** — отдельный регион обработчика; он выполняется при любом выходе из `try` (кроме аварийной остановки процесса).
- **`using` разворачивается в `try/finally`** с вызовом `Dispose()`, а `await using` — в асинхронный вариант.
- **Необработанное исключение.** Если подходящего `catch` в стеке нет, рантайм вызывает событие `AppDomain.UnhandledException`, и процесс завершается с ненулевым кодом (а в ASP.NET Core такие исключения перехватывает middleware — Фаза 4).
- **`StackOverflowException`, `OutOfMemoryException`** относятся к критическим: первое перехватить нельзя вообще; на второе опираться тоже нельзя (состояние процесса может быть неопределённым).
- **Исключения и потоки/`async`.** Исключение, брошенное в другом потоке или в `Task`, не «перелетает» к вызывающему само: оно сохраняется в задаче и выбрасывается при `await` (Фаза 5).

Подробнее: [исключения в справочнике](#/ref/d/fl-try-catch), [иерархия и стоимость](#/ref/d/fl-exception-cost), [rethrow](#/ref/d/fl-rethrow).

## Типичные ошибки и ловушки

:::danger Пустой `catch`
`catch (Exception) { }` прячет баги: программа продолжает работать в испорченном состоянии, а ты не знаешь почему. Если ловишь — обработай, залогируй или пробрось.
:::

:::danger `catch (Exception)` вокруг каждой операции
Лови там, где **можешь что-то сделать**: показать сообщение, повторить, откатить. Обычно это граница: цикл меню, обработчик HTTP-запроса (в Фазе 4 — middleware).
:::

:::danger `throw ex;` и потеря `innerException`
Теряется информация, нужная для отладки. `throw;` для проброса, `new XxxException("контекст", ex)` для обёртки.
:::

:::danger Исключения в горячем цикле для обычных ситуаций
Бросок исключения дорогой: собирается стек вызовов. Тысячи исключений в секунду из-за «нормального» неверного ввода — это и медленно, и неверно по смыслу.
:::

- **Ловить слишком общее.** `catch (Exception)` на низком уровне ловит и баги (`NullReferenceException`), и системные сбои. Лови конкретные типы; общий `catch` оставь для границы приложения с логированием.
- **Логировать и бросать дальше на каждом уровне.** Одна ошибка в логах 10 раз. Логируй там, где обрабатываешь.
- **Терять причину.** `catch (X) { throw new Y("ошибка"); }` без `innerException` — теряется оригинал.
- **Использовать только `Message`.** Для логов — `ex.ToString()` (с типом, стеком и вложенными исключениями).
- **Бросать `Exception` или `ApplicationException`.** Бросай конкретные типы: по ним ловят.
- **Исключения для управления потоком:** поиск в словаре через `try { dict[key] } catch (KeyNotFoundException)` вместо `TryGetValue`; преобразование типов через `Parse` вместо `TryParse`; выход из вложенных циклов исключением.
- **Работа с ресурсами без `using`.** Забытое `Dispose` при исключении = утечка файлового дескриптора/соединения.
- **Возврат/бросок из `finally`.** Затирает исходное исключение.
- **Смешивать валидацию ввода и контракт.** Проверка ввода пользователя — обычная логика (`if`/`TryParse`); исключение — когда вызвавший код нарушил контракт метода.
- **Пытаться «чинить» баги `catch`-ом.** `catch (NullReferenceException)` — запах: найди, откуда пришёл `null`.

## Вопросы с собеседований

:::spoiler Разница `throw;` и `throw ex;`
`throw;` пробрасывает текущее исключение, сохраняя исходный стек вызовов. `throw ex;` бросает тот же объект как будто заново: стек начинается с этой строки, и место реальной ошибки теряется.
:::

:::spoiler Когда создавать своё исключение?
Когда вызывающему коду нужно отличить эту ситуацию от других (поймать именно её) и/или получить структурированные данные о ней. Если отличать не нужно — подходит стандартное (`ArgumentException`, `InvalidOperationException`).
:::

:::spoiler Выполнится ли `finally`, если в `try` стоит `return`?
Да. `finally` выполняется перед фактическим выходом из метода.
:::

:::spoiler Почему `int.Parse` в цикле ввода с `catch (FormatException)` — плохой дизайн?
Неверный ввод пользователя — ожидаемая ситуация, а не нарушение контракта. Исключения для неё дороже, хуже читаются и смешивают обработку настоящих ошибок с обычной логикой. Для этого есть `TryParse`.
:::

:::spoiler Где в консольном банке ловить `BankException`?
В одном месте — в цикле обработки команд (граница между пользователем и доменной логикой). Доменные классы бросают, меню ловит и показывает сообщение.
:::

:::spoiler Не выполнится ли `finally` когда-нибудь? (ловушка: «всегда выполняется»)
Не выполнится при аварийном завершении процесса: `Environment.FailFast`, переполнение стека, убийство процесса ОС, отключение питания; также если поток бесконечно зависнет внутри `try`. В обычных путях (return, исключение, break) — выполняется.
:::

:::spoiler Зачем фильтры исключений `when` — чем лучше `if` внутри `catch` с `throw;`?
Фильтр проверяется до раскрутки стека: если он `false`, исключение не перехватывается, стек остаётся нетронутым (удобно для отладки и логирования), и `finally` внутренних блоков не выполняются преждевременно. Плюс код короче и яснее.
:::

:::spoiler Что такое `InnerException` и когда его использовать?
Исходное исключение, обёрнутое в более высокоуровневое. Используют, чтобы добавить контекст (`DataFileCorruptedException` вокруг `FormatException`), не теряя причину.
:::

:::spoiler Сколько стоит `try` без исключения? Можно ли им «обмазывать» горячий код?
Практически ничего — таблицы обработчиков не замедляют обычный путь. Дорого именно **бросание** исключения. Но `try/catch` может мешать некоторым оптимизациям JIT (встраиванию), поэтому в самых горячих циклах его выносят за цикл.
:::

:::spoiler `catch (Exception ex) { throw new MyException(ex.Message); }` — что плохо?
Теряется исходное исключение (нет `InnerException`) и его стек. Нужно `throw new MyException("контекст", ex);`.
:::

## Что запомнить

- Исключение — сигнал «метод не может выполнить обещание»; ожидаемые ситуации (ввод, поиск) — `if`/`TryXxx`, не исключения.
- Порядок `catch` — от частного к общему; пустой `catch` — зло; общий `catch (Exception)` — только на границе приложения.
- `throw;` сохраняет стек, `throw ex;` теряет; чтобы добавить контекст, оборачивай с `innerException`.
- `finally` выполняется практически всегда; `using` = `try/finally` с `Dispose` — освобождай ресурсы через него.
- Своё исключение — когда нужно отличить ситуацию или передать данные; заводи общую базу (`BankException`); наследуйся от `Exception`.
- Фильтр `when` проверяется до раскрутки стека; пользуйся для точного перехвата.
- Бросок дорогой (десятки мкс); баги (`NullReferenceException`, `IndexOutOfRange`) исправляют, а не ловят.
- Для логов — `ex.ToString()`, а не только `Message`.

## Практика

- [ ] Проверил порядок `catch`: поставил `Exception` первым и прочитал ошибку компилятора
- [ ] Сравнил стек вызовов при `throw;` и `throw ex;` (вывел `ex.StackTrace`)
- [ ] Создал иерархию `BankException` → `InsufficientFundsException`, `AccountNotFoundException`, `InvalidAmountException`
- [ ] Переписал ввод чисел с `Parse + catch` на `TryParse`
- [ ] Сделал цикл меню, который ловит `BankException` в одном месте и не глотает остальные исключения
- [ ] Проверил, что `using` закрывает файл даже при исключении внутри блока
- [ ] 5–6 упражнений на обработку ошибок

@@page id="p1-practice" phase="1" kind="practice" title="Практика: упражнения и 4 мини-программы" nav="Практика: упражнения и программы" est="весь период фазы"
:::why
Практика — **45% времени фазы**. Упражнения закрепляют синтаксис и рефлексы, мини-программы учат собирать из кусочков работающее целое. Каждую программу — в отдельный проект и в git.
:::

## Где брать упражнения (нужен интернет)

- **Exercism, трек C#** (exercism.org/tracks/csharp) — упражнения с тестами и разбором концепций. Лучший старт.
- **Codewars** (codewars.com), язык C#, уровни 8–6 kyu.
- **Свои эксперименты** из блоков «Практика» на страницах тем тоже считаются.

:::tip Как делать упражнения правильно
Сначала реши сам. Застрял на 20 минут — посмотри подсказку, а не готовое решение. После решения **обязательно** посмотри 2–3 чужих решения: так ты узнаешь идиомы языка. Если чужое решение лучше — перепиши своё по памяти через день.
:::

## Счётчик упражнений

Цель фазы — **50–80 маленьких упражнений**. Отмечай вехи:

- [ ] 10 упражнений: базовый синтаксис, ветвления, циклы
- [ ] 20 упражнений: + методы, строки
- [ ] 30 упражнений: + value/reference, боксинг (свои эксперименты)
- [ ] 40 упражнений: + классы, свойства, инкапсуляция
- [ ] 50 упражнений: + наследование, интерфейсы, исключения
- [ ] 60+ упражнений: повторение слабых тем

## Мини-программа 1. Калькулятор с обработкой ошибок {#calc}

Консольный калькулятор: пользователь вводит выражение вида `12.5 * 4` или `100 / 0`.

**Требования:**

- [ ] Операции `+ - * / %` и `^` (степень)
- [ ] Числа в `decimal`; ввод с точкой или запятой (реши явно, как поддерживаешь культуру)
- [ ] Неверный ввод (`abc + 1`, `5 +`, пустая строка) — понятное сообщение, программа **не падает**
- [ ] Деление на ноль — своё сообщение (подумай: проверка или `DivideByZeroException`?)
- [ ] Переполнение `decimal` (`79228162514264337593543950335 * 2`) — сообщение, а не падение
- [ ] Команда `history` — последние 10 вычислений; `exit` — выход
- [ ] Разбор выражения вынесен в отдельный метод `TryParseExpression(string input, out decimal a, out char op, out decimal b)`

:::spoiler Подсказка: структура
~~~csharp
while (true)
{
    Console.Write("> ");
    string? line = Console.ReadLine();
    if (line is null || line.Trim().Equals("exit", StringComparison.OrdinalIgnoreCase)) break;

    if (!Calculator.TryParseExpression(line, out decimal a, out char op, out decimal b))
    {
        Console.WriteLine("Формат: число оператор число, например 12.5 * 4");
        continue;
    }
    try
    {
        Console.WriteLine(Calculator.Apply(a, op, b));
    }
    catch (DivideByZeroException) { Console.WriteLine("Делить на ноль нельзя"); }
    catch (OverflowException) { Console.WriteLine("Слишком большое число"); }
}
~~~

`decimal` при делении на ноль бросает `DivideByZeroException`, а при переполнении — `OverflowException` (в отличие от `int`, который по умолчанию переполняется тихо).
:::

## Мини-программа 2. Конвертер валют и единиц {#converter}

- [ ] Таблица курсов в коде (`Dictionary<string, decimal>` относительно базовой валюты), минимум 4 валюты
- [ ] Ввод: `100 USD to TJS` (регистр не важен — `StringComparison.OrdinalIgnoreCase` или словарь с `StringComparer.OrdinalIgnoreCase`)
- [ ] Неизвестная валюта — сообщение со списком доступных
- [ ] Результат округлён до 2 знаков с `MidpointRounding.AwayFromZero`
- [ ] Второй режим: единицы длины (м, км, миля, фут) через `enum` и `switch`-выражение
- [ ] Курсы можно обновить командой `rate USD 10.95`; неверное значение (ноль, отрицательное) отклоняется

## Мини-программа 3. Крестики-нолики в консоли {#ttt}

- [ ] Поле 3×3 как `char[,]` или `Cell[]` с `enum Cell { Empty, X, O }`
- [ ] Отрисовка поля после каждого хода
- [ ] Ввод хода `строка столбец`; занятая клетка, выход за поле, мусор — сообщение и повтор хода
- [ ] Проверка победы по строкам, столбцам, диагоналям — **одним** методом, а не восемью `if`
- [ ] Ничья, когда поле заполнено
- [ ] Классы: `Board` (состояние и правила), `Game` (очерёдность), `Program` (ввод-вывод). `Board` не пишет в консоль
- [ ] Бонус: простой компьютерный соперник (выигрывающий ход → блокирующий → центр → случайный)

## Мини-программа 4. Парсер простого текстового формата {#parser}

Разбор INI-подобного файла настроек:

~~~text settings.ini
; комментарий
[bank]
name = Учебный банк
currency = TJS
overdraft_fee = 5.00

[limits]
max_withdrawals = 3
~~~

- [ ] Результат — `Dictionary<string, Dictionary<string, string>>` (секция → ключ → значение)
- [ ] Пустые строки и комментарии (`;` и `#`) пропускаются
- [ ] Пробелы вокруг `=` и по краям обрезаются
- [ ] Ключ вне секции, строка без `=`, пустой ключ, дубликат ключа — своё исключение `IniFormatException` **с номером строки**
- [ ] Типизированное чтение: `GetDecimal("bank", "overdraft_fee")` через `InvariantCulture` с понятной ошибкой
- [ ] Чтение файла через `File.ReadLines`, отсутствующий файл — понятное сообщение
- [ ] Проверено на 5 «битых» файлах: для каждого ожидаемое сообщение об ошибке

:::info Зачем именно этот парсер
Здесь ты отрабатываешь строки, коллекции, собственные исключения с контекстом и работу с файлами — ровно то, что понадобится для сохранения данных в [проекте «Банк»](#p1-project).
:::

@@page id="p1-project" phase="1" kind="project" title="Проект фазы: консольный банк" nav="Проект: консольный банк" est="3–4 недели"
:::why
Это первый артефакт для GitHub и прямая проверка критерия готовности: **работает, обрабатывает 8–10+ граничных случаев, можно показать без «ой, тут баг»**. Не CRUD-заглушка, а программа, которая защищает данные от неверных операций.
:::

## Функциональные требования

- [ ] Открыть счёт: владелец, вид счёта (расчётный с овердрафтом / накопительный), номер генерируется автоматически
- [ ] Пополнение, снятие, перевод между счетами
- [ ] История операций по счёту: дата, вид, сумма, баланс после операции, контрагент для переводов
- [ ] Выписка за период с итогами (через `StringBuilder`)
- [ ] Список всех счетов с балансами
- [ ] «Конец месяца»: проценты по накопительным, комиссии по овердрафту
- [ ] Сохранение в текстовый файл после каждой успешной операции и загрузка при старте

## Технические требования

- [ ] Деньги только в `decimal`; в файл — через `CultureInfo.InvariantCulture`
- [ ] Доменные классы (`Account` и наследники, `Transaction`) не пишут в консоль и не читают её
- [ ] Иерархия исключений `BankException`; обработка — в одном месте, в цикле меню
- [ ] Хранилище за интерфейсом `IAccountStore` (файл + реализация в памяти)
- [ ] Время через `IClock`, чтобы проверять «конец месяца» без ожидания
- [ ] Не меньше 15 осмысленных коммитов, а не один «done»
- [ ] README: что умеет, как запустить, формат файла, список обрабатываемых граничных случаев

## Структура проекта

~~~text
ConsoleBank/
├── ConsoleBank.csproj
├── Program.cs                    ← точка входа: собирает зависимости, запускает меню
├── Domain/
│   ├── Account.cs                ← абстрактный базовый класс, шаблонный Withdraw
│   ├── CheckingAccount.cs
│   ├── SavingsAccount.cs
│   ├── Transaction.cs            ← record
│   └── Exceptions.cs             ← BankException и наследники
├── Services/
│   ├── Bank.cs                   ← открыть счёт, перевод, конец месяца
│   └── IClock.cs
├── Storage/
│   ├── IAccountStore.cs
│   ├── TextFileAccountStore.cs
│   └── InMemoryAccountStore.cs
└── UI/
    └── ConsoleMenu.cs            ← ввод/вывод, перехват BankException
~~~

## Этапы (по коммитам)

1. [ ] **Домен без UI.** `Account`, наследники, `Transaction`, исключения. Проверка руками в `Program.cs`: сценарии и ожидаемый результат в комментариях.
2. [ ] **Банк.** Класс `Bank` со списком счетов: открыть, найти, перевести. `AccountNotFoundException` для неизвестного номера.
3. [ ] **Меню.** Консольный цикл команд, `TryParse` для ввода, перехват `BankException`.
4. [ ] **История и выписка.** Баланс после операции в каждой записи, выписка за период.
5. [ ] **Сохранение.** `TextFileAccountStore`: формат, запись, загрузка, битые строки.
6. [ ] **Конец месяца.** `IClock`, проценты, комиссии; проверка с `FixedClock`.
7. [ ] **Граничные случаи.** Пройти весь список ниже, для каждого — ручная проверка.
8. [ ] **README и демо-сценарий.** Прогнать демо три раза подряд без сбоев.

## Граничные случаи (минимум 8–10, лучше все)

- [ ] Сумма ноль или отрицательная → `InvalidAmountException`
- [ ] Больше двух знаков после запятой (`10.555`) → отклонить (`decimal.Scale` или сравнение с `Math.Round`)
- [ ] Снятие больше баланса на накопительном счёте → `InsufficientFundsException` с балансом и запрошенной суммой
- [ ] Снятие за пределы овердрафта на расчётном → отклонено
- [ ] Четвёртое снятие за месяц с накопительного → отклонено с понятной причиной
- [ ] Перевод на тот же самый счёт → отклонено
- [ ] Перевод на несуществующий счёт → `AccountNotFoundException`, **деньги не списаны**
- [ ] Перевод, который не прошёл на этапе зачисления → списание откатывается (баланс отправителя не меняется)
- [ ] Пустое имя владельца или только пробелы → отклонено
- [ ] Нечисловой ввод суммы или пункта меню → повтор ввода, не падение
- [ ] Ввод с запятой и с точкой → поведение описано в README и одинаково везде
- [ ] Огромная сумма (`decimal.MaxValue`, затем пополнение) → `OverflowException` превращается в сообщение, данные не портятся
- [ ] Файла данных нет при первом запуске → старт с пустым банком
- [ ] В файле битая строка → понятная ошибка с номером строки, программа не теряет остальные данные молча
- [ ] Сбой записи файла (файл открыт другой программой, нет прав) → сообщение, данные в памяти целы, следующая попытка возможна

## Ключевые места: подсказки

:::spoiler Перевод без «полусписанных» денег
~~~csharp
public void Transfer(string fromNumber, string toNumber, decimal amount)
{
    if (string.Equals(fromNumber, toNumber, StringComparison.Ordinal))
        throw new BankException("Нельзя перевести на тот же счёт");

    // 1. Сначала найти ОБА счёта: если второго нет — ничего не списано.
    Account from = Find(fromNumber);   // бросает AccountNotFoundException
    Account to = Find(toNumber);

    // 2. Списание проверяет все правила (сумма, баланс, лимиты) и бросает исключение при нарушении.
    from.Withdraw(amount);
    try
    {
        to.Deposit(amount);
    }
    catch
    {
        from.Deposit(amount);          // 3. Компенсация: вернуть деньги, если зачисление не удалось
        throw;                         // и пробросить исходную ошибку
    }
}
~~~

В Фазе 3 то же самое решает **транзакция базы данных**. Сейчас важно увидеть проблему: две операции должны пройти вместе или не пройти вовсе. Учти, что компенсирующий `Deposit` в этом примере тоже попадёт в историю; подумай, как пометить его как отмену.
:::

:::spoiler Формат файла и безопасная запись
Простой построчный формат с разделителем `|` (в именах его быть не должно — проверь при открытии счёта):

~~~text accounts.txt
ACC|ACC-0001|Анна Иванова|Checking|500
ACC|ACC-0002|Борис Петров|Savings|0.01
TX|ACC-0001|2026-10-01T10:15:00.0000000+05:00|Deposit|1500.00|
TX|ACC-0001|2026-10-03T18:40:00.0000000+05:00|TransferOut|200.00|ACC-0002
TX|ACC-0002|2026-10-03T18:40:00.0000000+05:00|TransferIn|200.00|ACC-0001
~~~

Баланс не хранится, а **вычисляется** из истории операций при загрузке: так баланс и история не могут разойтись.

~~~csharp
using System.Globalization;

static string FormatTx(string account, Transaction tx) => string.Join('|',
    "TX", account,
    tx.At.ToString("O", CultureInfo.InvariantCulture),            // ISO 8601 со смещением пояса, не зависит от культуры
    tx.Kind.ToString(),
    tx.Amount.ToString(CultureInfo.InvariantCulture),
    tx.Counterparty ?? "");

static void SaveAtomically(string path, IEnumerable<string> lines)
{
    string tmp = path + ".tmp";
    File.WriteAllLines(tmp, lines);           // 1. пишем во временный файл
    File.Move(tmp, path, overwrite: true);    // 2. подменяем: старый файл не останется полузаписанным
}
~~~

При разборе: `line.Split('|')`, проверка количества полей, `decimal.Parse(parts[4], CultureInfo.InvariantCulture)`, `DateTime.Parse(parts[2], CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind)`. Любая ошибка — `DataFileCorruptedException` с номером строки и исходным исключением внутри.
:::

:::spoiler Меню: один цикл, одна точка обработки ошибок
~~~csharp
public void Run()
{
    while (true)
    {
        PrintMenu();
        string? choice = Console.ReadLine()?.Trim();
        if (choice is null || choice == "0") return;

        try
        {
            switch (choice)
            {
                case "1": OpenAccount(); break;
                case "2": Deposit(); break;
                case "3": Withdraw(); break;
                case "4": Transfer(); break;
                case "5": ShowStatement(); break;
                default: Console.WriteLine("Нет такого пункта"); break;
            }
        }
        catch (BankException ex)
        {
            Console.WriteLine($"✖ {ex.Message}");
        }
        catch (IOException ex)
        {
            Console.WriteLine($"✖ Не удалось сохранить данные: {ex.Message}. Операция в памяти выполнена, попробуйте сохранить снова.");
        }
    }
}

private decimal ReadAmount(string prompt)
{
    while (true)
    {
        Console.Write(prompt);
        string? raw = Console.ReadLine()?.Replace(',', '.');
        if (decimal.TryParse(raw, NumberStyles.Number, CultureInfo.InvariantCulture, out decimal amount))
            return amount;                     // проверку «> 0» и «2 знака» делает домен
        Console.WriteLine("Введите число, например 150.75");
    }
}
~~~

`Replace(',', '.')` + `InvariantCulture` — простой способ принимать и запятую, и точку. Опиши это решение в README.
:::

## Демо-сценарий «показать без ой»

Запиши в README и прогони перед тем, как отметить критерий:

1. Удалить файл данных, запустить программу — старт с пустым банком.
2. Открыть расчётный счёт (овердрафт 500) и накопительный.
3. Пополнить расчётный на 1000, перевести 300 на накопительный.
4. Попробовать перевести 2000 → отказ, балансы не изменились.
5. Перевести на несуществующий номер → отказ, деньги не списаны.
6. Ввести `abc` как сумму, `-5`, `10.555` → понятные сообщения.
7. Снять с накопительного 4 раза → четвёртое отклонено.
8. Выполнить «конец месяца» → проценты и комиссии.
9. Выйти, запустить снова → все счета и история на месте, балансы совпадают.
10. Показать выписку за период.

:::key Проверка проекта перед тем, как отметить критерий фазы
- [ ] Демо-сценарий проходит три раза подряд без единого сбоя
- [ ] Обработано не меньше 8–10 граничных случаев из списка, и все перечислены в README
:::

:::tip После сдачи
Положи проект в GitHub с README, закрепи в профиле. Через 4–6 недель (в Фазе 2) сделай код-ревью этого проекта сам себе: что бы ты сейчас написал иначе? Это и есть видимый рост без чужой лести.
:::
