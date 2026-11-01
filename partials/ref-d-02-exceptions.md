@@ref id="fl-rethrow" cat="D" title="throw, throw; и InnerException" cs="1.0" cx="O(1)" mem="O(1)" tags="throw rethrow throw; throw ex потеря стека InnerException ExceptionDispatchInfo обёртка исключения throw-выражение" topic="p1-exceptions" related="fl-try-catch,fl-filters,fl-custom-exceptions,op-throw-expression" learn="dotnet/csharp/language-reference/statements/exception-handling-statements::Оператор throw"
`throw` выбрасывает исключение; внутри `catch` голый `throw;` перебрасывает текущее **с сохранением** исходного стека вызовов, а `throw e;` сбрасывает стек на текущую строку.

## Синтаксис {#syntax}

~~~csharp @nocheck
throw new ArgumentException("плохо", nameof(arg));
catch (IOException) { Log(); throw; }                       // переброс без потери стека
catch (IOException e) { throw new DataException("не загрузили", e); }   // обёртка
var x = value ?? throw new ArgumentNullException(nameof(value));         // throw-выражение
ExceptionDispatchInfo.Capture(e).Throw();                  // переброс сохранённого
~~~

## Семантика {#semantics}

- `throw выражение;` требует объект, производный от `System.Exception`. `throw;` допустим только в `catch`.
- `throw;` сохраняет `StackTrace`, `throw e;` начинает трассу заново с текущего места — теряется информация о том, где ошибка возникла на самом деле.
- Оборачивая исключение в другое, **всегда передавайте оригинал** как `innerException`: цепочка причин остаётся доступной через `InnerException`.
- Используйте обёртку, когда нужно сменить уровень абстракции: низкоуровневое `SqlException` превращается в `RepositoryException`, не раскрывая детали клиенту.
- Не перебрасывайте исключение, если ничего не добавляете: достаточно не писать `catch`.
- `throw` можно использовать как выражение (C# 7) в `??`, тернарном операторе и стрелочных членах — удобно для проверок аргументов.
- Для переброса из другого потока или потом (например, из `Task`) применяйте `ExceptionDispatchInfo.Capture(e).Throw()`: он добавляет строку, но сохраняет исходный стек.
- `AggregateException` оборачивает несколько ошибок параллельных задач; `await` разворачивает первую внутреннюю.
- Исключение `ThreadAbort` в .NET Core отсутствует; прерывать потоки исключением нельзя.
- Не выбрасывайте `Exception`, `SystemException`, `ApplicationException`, `NullReferenceException` и `IndexOutOfRangeException` вручную: они зарезервированы за средой выполнения и бесполезны для диагностики.
- Практический порядок такой: сначала решите, нужен ли `catch` вообще; если нужен только для логирования — используйте фильтр `when` с возвратом `false`; если нужна смена типа — обёртка с `inner`; если нужно просто пропустить дальше — `throw;`. Так каждый приём применяется там, где он безопаснее всего.
- При переносе исключения между потоками (например, из рабочего потока в вызывающий) храните его в `ExceptionDispatchInfo` и бросайте там, где результат нужен, — стек обоих мест сохранится в трассе.

## Под капотом {#internals}

`throw` в IL — инструкция `throw`, а `throw;` — `rethrow`, которая не трогает захваченный стек. `StackTrace` заполняется по мере раскрутки: каждый кадр добавляется, когда исключение проходит через метод.

## Сложность {#complexity}

Выброс — десятки микросекунд; каждое повторное создание обёртки добавляет захват стека и аллокации.

## Версии {#versions}

- C# 1.0 — `throw`, `throw;`; C# 7.0 — `throw`-выражения.
- .NET 6 — `ArgumentNullException.ThrowIfNull`; .NET 8 — `ThrowIfNegative`, `ThrowIfZero` и родственные.

## Ловушки {#pitfalls}

**`throw e;` стирает исходное место ошибки.**

~~~csharp
try { A(); } catch (Exception e) { Console.WriteLine("throw;   видит Fail в стеке: " + e.StackTrace!.Contains("Fail")); }
try { B(); } catch (Exception e) { Console.WriteLine("throw e; видит Fail в стеке: " + e.StackTrace!.Contains("Fail")); }

static void Fail() => throw new InvalidOperationException();
static void A() { try { Fail(); } catch (Exception) { throw; } }
static void B() { try { Fail(); } catch (Exception e) { throw e; } }
~~~
~~~console
throw;   видит Fail в стеке: True
throw e; видит Fail в стеке: False
~~~

**Обёртка без `inner`:** теряется причина.

**Слишком многоуровневые обёртки** удлиняют цепочку без пользы.

**Бросать исключения в деструкторах и `Dispose`** — они затирают основное.

## Примеры {#examples}

~~~csharp
try { Load("data.txt"); }
catch (Exception e)
{
    for (Exception? x = e; x != null; x = x.InnerException) Console.WriteLine(x.GetType().Name + ": " + x.Message);
}

static void Load(string path)
{
    try { throw new FileNotFoundException("нет файла " + path); }
    catch (IOException e) { throw new InvalidOperationException("не удалось загрузить настройки", e); }
}
~~~
~~~console
InvalidOperationException: не удалось загрузить настройки
FileNotFoundException: нет файла data.txt
~~~

@@ref id="fl-custom-exceptions" cat="D" title="Собственные исключения" cs="1.0" cx="O(1)" mem="O(1)" tags="custom exception собственное исключение наследование от Exception конструкторы Serializable доменные ошибки код ошибки свойства" topic="p1-exceptions,p4-errors" related="fl-try-catch,fl-rethrow,fl-exception-hierarchy,cl-records" learn="dotnet/standard/exceptions/how-to-create-user-defined-exceptions::Создание пользовательских исключений"
Собственный класс исключения нужен, когда вызывающему важно отличить вашу ошибку от остальных и получить машиночитаемые данные: код, идентификатор, значение.

## Синтаксис {#syntax}

~~~csharp @nocheck
public class OrderNotFoundException : Exception
{
    public int OrderId { get; }
    public OrderNotFoundException(int id) : base($"Заказ {id} не найден") => OrderId = id;
    public OrderNotFoundException(int id, Exception inner) : base($"Заказ {id} не найден", inner) => OrderId = id;
}
~~~

## Семантика {#semantics}

- Наследуйтесь от `Exception` (не от `ApplicationException`, он устарел по смыслу). Имя заканчивается на `Exception`.
- Поддерживайте стандартные конструкторы: без параметров, с сообщением, с сообщением и `innerException`. Анализаторы подсказывают, если их не хватает.
- Добавляйте только неизменяемые свойства с данными об ошибке; не кладите в исключение тяжёлые объекты и секреты (оно попадает в логи).
- Создавайте иерархию: общий базовый класс домена (`DomainException`) и конкретные потомки. Вызывающий может ловить ту степень детализации, которая нужна.
- Исключение — сигнал о нарушении ожиданий, а не нормальный результат: «пользователь не найден» в поиске — это `null`/`Result`, а в операции «получи или падай» — исключение.
- Для ASP.NET Core сопоставьте типы исключений кодам ответа в одном обработчике (`IExceptionHandler`, `ProblemDetails`).
- Двоичная сериализация исключений в современных версиях не используется; устаревшие атрибуты `[Serializable]` и конструктор `SerializationInfo` не нужны.
- Не создавайте новый тип, если подходит стандартный: `ArgumentException`, `InvalidOperationException`, `NotSupportedException`, `KeyNotFoundException`.
- Переопределение `Message` или `ToString` оправдано редко: сообщение удобнее передавать в базовый конструктор.
- Тестируйте собственные исключения: проверяйте тип, свойства и то, что `InnerException` передаётся. В API, который будут вызывать другие команды, документируйте в XML-комментариях тег `<exception>`: так IDE подскажет, что может быть выброшено.
- Если несколько исключений различаются только кодом, лучше одно исключение со свойством `Code` и перечислением, чем десяток почти пустых классов.

## Под капотом {#internals}

Исключение — обычный объект со стандартными полями (`_message`, `_innerException`, `_stackTrace`, `HResult`). Стек записывается при выбросе, а не при создании, поэтому создавать исключение заранее и бросать позже нельзя ожидать правильной трассы.

## Сложность {#complexity}

Создание исключения без выброса дёшево (одна аллокация); основная цена — захват стека при `throw`.

## Версии {#versions}

- C# 1.0 — наследование от `Exception`; C# 12 — первичные конструкторы позволяют записывать их короче.
- .NET 8 — исключения не требуют `[Serializable]`.

## Ловушки {#pitfalls}

**Потерянная причина без `innerException`.**

~~~csharp
try { Service.Get(5); }
catch (OrderNotFoundException e) { Console.WriteLine($"{e.Message} (id={e.OrderId}), причина: {e.InnerException?.GetType().Name ?? "нет"}"); }

try { Service.GetWrapped(7); }
catch (OrderNotFoundException e) { Console.WriteLine($"{e.Message} (id={e.OrderId}), причина: {e.InnerException?.GetType().Name ?? "нет"}"); }

class OrderNotFoundException(int id, Exception? inner = null) : Exception($"Заказ {id} не найден", inner)
{ public int OrderId { get; } = id; }
static class Service
{
    public static void Get(int id) => throw new OrderNotFoundException(id);
    public static void GetWrapped(int id)
    {
        try { throw new KeyNotFoundException(); }
        catch (KeyNotFoundException e) { throw new OrderNotFoundException(id, e); }
    }
}
~~~
~~~console
Заказ 5 не найден (id=5), причина: нет
Заказ 7 не найден (id=7), причина: KeyNotFoundException
~~~

**Типы исключений на каждый чих** — иерархия, которую никто не ловит по отдельности.

**Данные в сообщении вместо свойств:** вызывающему приходится разбирать строку.

**Логирование паролей и ключей** через `Message` или `Data`.

## Примеры {#examples}

~~~csharp
try { new Account(100).Withdraw(150); }
catch (InsufficientFundsException e) { Console.WriteLine($"{e.Message}: не хватает {e.Missing}"); }

class InsufficientFundsException(decimal missing) : Exception($"Недостаточно средств")
{ public decimal Missing { get; } = missing; }
class Account(decimal balance)
{
    public void Withdraw(decimal sum)
    {
        if (sum > balance) throw new InsufficientFundsException(sum - balance);
        balance -= sum;
    }
}
~~~
~~~console
Недостаточно средств: не хватает 50
~~~

@@ref id="fl-exception-hierarchy" cat="D" title="Стандартные исключения .NET" cs="1.0" cx="O(1)" mem="O(1)" tags="ArgumentException ArgumentNullException InvalidOperationException NotSupportedException NotImplementedException KeyNotFoundException FormatException InvalidCastException OverflowException ObjectDisposedException иерархия таблица" topic="p1-exceptions" related="fl-try-catch,fl-custom-exceptions,fl-guard" learn="dotnet/standard/exceptions/best-practices-for-exceptions::Рекомендации по работе с исключениями" table="1"
Базовая библиотека определяет десятки готовых исключений; правильный выбор стандартного типа делает ваш код предсказуемым — вызывающий ловит именно то, что ожидает.

## Синтаксис {#syntax}

~~~csharp @nocheck
throw new ArgumentOutOfRangeException(nameof(count), count, "Должно быть > 0");
throw new InvalidOperationException("Сначала вызовите Open()");
throw new NotSupportedException();
~~~

## Семантика {#semantics}

- Все исключения наследуются от `System.Exception`. Два основных потомка: `SystemException` (генерируются средой и BCL) и ваши собственные классы.
- `ArgumentException` и его потомки сообщают о неверном **аргументе** метода: `ArgumentNullException`, `ArgumentOutOfRangeException`. Укажите имя параметра через `nameof`.
- `InvalidOperationException` — объект в состоянии, при котором операция недопустима (закрытый поток, пустая очередь, изменённая коллекция).
- `ObjectDisposedException` наследует от `InvalidOperationException` и сообщает об использовании освобождённого объекта.
- `NotSupportedException` — операция не поддерживается в принципе (запись в read-only поток); `NotImplementedException` — «ещё не написано», не оставляйте в готовом коде.
- `KeyNotFoundException` — нет ключа в словаре; `FormatException`, `OverflowException`, `InvalidCastException` — ошибки разбора, переполнения и приведения.
- `NullReferenceException` и `IndexOutOfRangeException` — ошибки **программиста**; их не бросают вручную и не ловят: нужно исправлять код.
- Ниже в таблице — самые частые типы и когда они уместны.

:::sortable Частые исключения
| Исключение | Когда | Кто бросает |
|---|---|---|
| ArgumentNullException | аргумент равен null | ваш код, BCL |
| ArgumentOutOfRangeException | значение вне допустимого диапазона | ваш код, BCL |
| ArgumentException | прочие неверные аргументы | ваш код, BCL |
| InvalidOperationException | недопустимое состояние объекта | ваш код, BCL |
| ObjectDisposedException | объект уже освобождён | ваш код, BCL |
| NotSupportedException | операция не поддерживается | ваш код, BCL |
| KeyNotFoundException | ключ не найден | Dictionary |
| FormatException | неверный формат строки | Parse |
| InvalidCastException | недопустимое приведение | CLR |
| NullReferenceException | обращение к null | CLR |
| DivideByZeroException | целочисленное деление на ноль | CLR |
| OverflowException | переполнение в checked | CLR |
:::

## Под капотом {#internals}

Часть исключений создаёт среда выполнения сама (`NullReferenceException`, `DivideByZeroException`, `InvalidCastException`) на основе аппаратных ловушек и проверок JIT; остальные — обычные классы BCL, которые бросает код библиотеки.

## Сложность {#complexity}

Тип исключения не влияет на цену выброса: она определяется захватом стека.

## Версии {#versions}

- .NET 6 — `ArgumentNullException.ThrowIfNull`; .NET 7/8 — `ArgumentOutOfRangeException.ThrowIfNegative`, `ThrowIfGreaterThan` и другие проверяющие методы.
- C# 10 — `CallerArgumentExpression` позволяет подставлять имя аргумента автоматически.

## Ловушки {#pitfalls}

**Не то исключение и не то имя параметра.**

~~~csharp
try { Pick(new[] { 1, 2 }, 5); }
catch (ArgumentOutOfRangeException e) { Console.WriteLine(e.ParamName); }

try { Pick(null!, 0); }
catch (ArgumentNullException e) { Console.WriteLine(e.ParamName); }

static int Pick(int[] a, int i)
{
    ArgumentNullException.ThrowIfNull(a);
    ArgumentOutOfRangeException.ThrowIfGreaterThanOrEqual(i, a.Length);
    return a[i];
}
~~~
~~~console
i
a
~~~

**Бросать `Exception` или `NullReferenceException`** вручную.

**`NotImplementedException` в релизе** — забытая заглушка.

**Ловля `InvalidCastException` вместо проверки `is`/`as`.**

## Примеры {#examples}

~~~csharp
var q = new Queue<int>();
try { q.Dequeue(); } catch (InvalidOperationException e) { Console.WriteLine(e.GetType().Name); }

var d = new Dictionary<string, int>();
try { _ = d["x"]; } catch (KeyNotFoundException e) { Console.WriteLine(e.GetType().Name); }

try { checked { int m = int.MaxValue; m++; } } catch (OverflowException e) { Console.WriteLine(e.GetType().Name); }
~~~
~~~console
InvalidOperationException
KeyNotFoundException
OverflowException
~~~

@@ref id="fl-exception-cost" cat="D" title="Стоимость исключений и TryXxx" cs="1.0" cx="O(стек)" mem="O(стек)" danger="1" tags="стоимость исключений производительность TryParse TryGetValue Try-паттерн ловушка исключения как поток управления бенчмарк Stopwatch первый брошенный" topic="p1-exceptions" related="fl-try-catch,fl-guard,fl-custom-exceptions" learn="dotnet/standard/exceptions/best-practices-for-exceptions::Рекомендации по работе с исключениями"
Выброс исключения на несколько порядков дороже обычной проверки, поэтому исключения нужны для редких ошибок; для частых «неудач» используют `TryXxx`-методы и результаты операций.

## Синтаксис {#syntax}

~~~csharp @nocheck
if (int.TryParse(text, out var n)) { ... }
if (dict.TryGetValue(key, out var v)) { ... }
var r = Parse(text);            // Result<int, Error> — собственный тип результата
~~~

## Семантика {#semantics}

- При выбросе среда выполнения создаёт объект, собирает трассу стека, ищет обработчик в нескольких кадрах и раскручивает стек. Это десятки микросекунд, тогда как `TryParse` — десятки наносекунд.
- Первое исключение в процессе дополнительно дорого: загружаются ресурсы и инициализируется механизм трассировки (разогрев).
- Стоимость растёт с глубиной стека между `throw` и `catch`.
- **Try-паттерн:** метод возвращает `bool`, а результат — через `out`. Так устроены `TryParse`, `TryGetValue`, `TryAdd`, `Dictionary.TryRemove`, `TryDequeue`.
- Правило: исключение — для ситуации, которой «не должно быть» (нарушенный контракт, недоступная база); TryXxx или `null` — для частой и ожидаемой (ввод пользователя, отсутствие ключа).
- Не ловите исключение, чтобы проверить условие, которое можно проверить заранее: `File.Exists` до `File.Open` не гарантирует отсутствие гонок, но убирает основной поток ошибок.
- Для веб-API ошибки валидации не должны быть исключениями: возвращайте 400 и список ошибок.
- Результат операции можно представить типом `Result`/`OneOf`, который содержит либо значение, либо ошибку.
- Асинхронный код: исключение в `Task` сохраняется внутри задачи и выбрасывается при `await`, цена та же.

## Под капотом {#internals}

Выброс включает двухпроходный поиск обработчика, раскрутку стека, вызов `finally` и захват трассы (строки методов, смещения IL). В .NET 9 управляемая реализация обработки исключений ускорила выброс в несколько раз по сравнению с предыдущими версиями, но остаётся значительно дороже обычного возврата.

## Сложность {#complexity}

Обычный путь `O(1)` и очень дешёвый. Выброс — `O(глубина стека)` и тысячи тактов.

## Версии {#versions}

- Try-паттерн широко распространён с .NET 2.0 (`TryParse`).
- .NET 9 — новая управляемая обработка исключений; в .NET 8 и ранее выброс заметно медленнее (точные цифры зависят от окружения, требует проверки).

## Ловушки {#pitfalls}

**Парсинг в цикле через исключения.**

~~~csharp
var data = Enumerable.Repeat("x", 2000).ToArray();

var sw = System.Diagnostics.Stopwatch.StartNew();
int bad = 0;
foreach (var s in data) { try { int.Parse(s); } catch (FormatException) { bad++; } }   // ❌
long slow = sw.ElapsedTicks;

sw.Restart();
int bad2 = 0;
foreach (var s in data) if (!int.TryParse(s, out _)) bad2++;                           // ✅
long fast = sw.ElapsedTicks;

Console.WriteLine($"{bad} {bad2}");
Console.WriteLine("исключения медленнее: " + (slow > fast));
~~~
~~~console
2000 2000
исключения медленнее: True
~~~

**Ловля и повторный выброс** на каждом уровне умножает стоимость.

**Исключение вместо `null`** для штатной ситуации «не найдено».

**Преждевременная оптимизация:** редкие исключения не требуют `Try`-методов.

## Примеры {#examples}

~~~csharp
string[] inputs = { "10", "abc", "30", "", "-5" };
int sum = 0, errors = 0;
foreach (var s in inputs)
    if (int.TryParse(s, out var n)) sum += n; else errors++;
Console.WriteLine($"сумма={sum}, ошибок={errors}");

var d = new Dictionary<string, int> { ["a"] = 1 };
Console.WriteLine(d.TryGetValue("a", out var v) ? v : -1);
Console.WriteLine(d.TryGetValue("z", out var w) ? w : -1);
~~~
~~~console
сумма=35, ошибок=2
1
-1
~~~

@@ref id="fl-guard" cat="D" title="Проверка аргументов и защитные условия" cs="1.0" cx="O(1)" mem="O(1)" tags="guard clause проверка аргументов ThrowIfNull ArgumentException ThrowIfNullOrEmpty Debug.Assert контракт предусловие валидация CallerArgumentExpression" topic="p1-exceptions,p1-methods" related="fl-exception-hierarchy,fl-exception-cost,ty-nullable-ref,fl-if" learn="?dotnet/api/system.argumentnullexception.throwifnull::ArgumentNullException.ThrowIfNull"
Публичный метод должен проверять свои предусловия в самом начале и выбрасывать подходящее исключение; это превращает ошибку использования в понятное сообщение у точки вызова.

## Синтаксис {#syntax}

~~~csharp @nocheck
ArgumentNullException.ThrowIfNull(order);
ArgumentException.ThrowIfNullOrEmpty(name);
ArgumentOutOfRangeException.ThrowIfNegative(count);
if (qty <= 0) throw new ArgumentOutOfRangeException(nameof(qty), qty, "Должно быть больше 0");
Debug.Assert(index >= 0);
~~~

## Семантика {#semantics}

- Проверяйте аргументы **публичных** методов и конструкторов в начале. Для приватных методов достаточно `Debug.Assert`: он убирается из релизной сборки.
- `ArgumentNullException.ThrowIfNull(x)` подставляет имя аргумента автоматически (`CallerArgumentExpression`); используйте его вместо ручной проверки `if (x == null)`.
- Для строк: `ThrowIfNullOrEmpty` и `ThrowIfNullOrWhiteSpace`; для чисел — `ThrowIfNegative`, `ThrowIfZero`, `ThrowIfGreaterThan` и другие (.NET 8).
- С включёнными nullable-ссылками проверка `ThrowIfNull` нужна на границе модуля, где вызывающий мог игнорировать предупреждения.
- Проверка и исключение выполняются до любых побочных эффектов: метод не должен менять состояние, а затем падать на проверке.
- В итераторах и `async`-методах проверка выполняется при первом `MoveNext` или `await` — разделяйте метод на внешний с проверками и внутренний с `yield` ([локальные функции](#/ref/c/cl-local-closures)).
- Исключение `ArgumentException` сообщает о **вызывающем коде**; отказ из-за состояния объекта — `InvalidOperationException`.
- Атрибуты `[NotNull]`, `[DoesNotReturn]` помогают анализатору понять, что после проверки значение не `null`.
- Внутри домена используйте модель, которая не допускает невалидное состояние (конструкторы, `required`, типы-значения).
- Хорошая привычка — отделять «ошибки вызывающего» (аргументы) от «ошибок состояния» (объект в неподходящем режиме) и «ошибок окружения» (нет файла, обрыв сети). Каждая группа требует своего типа исключения и своей реакции на верхнем уровне.
- В публичных библиотеках документируйте предусловия в XML-комментариях и покрывайте их тестами: каждый `ThrowIfNull` должен иметь тест, который передаёт `null` и проверяет `ParamName`.

## Под капотом {#internals}

`ThrowIfNull` — небольшой метод, который JIT встраивает; путь без ошибки состоит из сравнения с `null`. Сам выброс вынесен в отдельный метод `ThrowNull`, чтобы горячий код оставался компактным.

## Сложность {#complexity}

Проверка — одно сравнение; затраты исчезают на фоне полезной работы.

## Версии {#versions}

- C# 10 / .NET 6 — `CallerArgumentExpression`, `ThrowIfNull`.
- .NET 7 — `ThrowIfNullOrEmpty`; .NET 8 — `ThrowIfNegative`, `ThrowIfZero`, `ThrowIfGreaterThan` и родственные.

## Ловушки {#pitfalls}

**Проверка внутри итератора откладывается.**

~~~csharp
IEnumerable<int> seq = Numbers(null!);        // ❌ исключения пока нет
Console.WriteLine("итератор создан");
try { foreach (var x in seq) { } }
catch (ArgumentNullException e) { Console.WriteLine("ошибка при переборе: " + e.ParamName); }

try { Safe(null!); }
catch (ArgumentNullException e) { Console.WriteLine("сразу: " + e.ParamName); }

static IEnumerable<int> Numbers(int[] a) { ArgumentNullException.ThrowIfNull(a); foreach (var x in a) yield return x; }
static IEnumerable<int> Safe(int[] a) { ArgumentNullException.ThrowIfNull(a); return Impl(a); IEnumerable<int> Impl(int[] a2) { foreach (var x in a2) yield return x; } }
~~~
~~~console
итератор создан
ошибка при переборе: a
сразу: a
~~~

**Проверка после побочных эффектов.**

**`Debug.Assert` вместо проверки** в публичном API: в релизе проверки нет.

**Тип исключения не соответствует ситуации** (`Exception` вместо `ArgumentException`).

## Примеры {#examples}

~~~csharp
try { Make("", 3); } catch (ArgumentException e) { Console.WriteLine(e.ParamName); }
try { Make("ok", -1); } catch (ArgumentOutOfRangeException e) { Console.WriteLine(e.ParamName); }
Console.WriteLine(Make("ok", 2));

static string Make(string name, int count)
{
    ArgumentException.ThrowIfNullOrEmpty(name);
    ArgumentOutOfRangeException.ThrowIfNegative(count);
    return string.Concat(Enumerable.Repeat(name, count));
}
~~~
~~~console
name
count
okok
~~~
