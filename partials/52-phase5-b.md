@@page id="p5-unit-tests" phase="5" kind="topic" title="Unit-тесты: xUnit, AAA, что и как тестировать" nav="Unit-тесты (xUnit)" est="~1 неделя"
:::why
Тесты — это страховка, которая позволяет менять код без страха. Для работодателя тесты в портфолио — сигнал «этот человек думает о поддержке». Критерий фазы: **40–50 осмысленных unit-тестов** — не ради числа, а ради бизнес-правил.
:::

## Зачем это нужно

Любой код, который не покрыт проверками, со временем превращается в «трогать нельзя»: никто не уверен, что изменение не сломает соседнее правило, поэтому его либо не делают, либо проверяют вручную через Swagger, что долго и ненадёжно. Автоматические тесты решают три задачи сразу: ловят поломки сразу после изменения, служат живой документацией («что должен делать класс»), а при исправлении багов фиксируют, что баг не вернётся.

Unit-тест проверяет маленький кусок логики (класс, метод) **изолированно**, без базы, сети и файловой системы, поэтому выполняется за миллисекунды и запускается при каждом сохранении. Для backend-разработчика уровня Junior unit-тесты — основная форма тестирования бизнес-правил: переходов статусов, расчётов, ограничений.

Что ты получишь от темы:

- научишься писать тест по схеме Arrange — Act — Assert и давать тестам осмысленные имена;
- поймёшь разницу `[Fact]` и `[Theory]` и применишь последний для граничных значений;
- сможешь отличить хороший тест от плохого (слабые проверки, зависимость от порядка, от времени);
- будешь знать, что тестировать в первую очередь, а на что тратить время не стоит;
- сможешь отвечать на вопросы собеседований: «что такое AAA», «чем Fact отличается от Theory», «как тестировать код со временем и случайностью», «что делает тест хорошим».

Важное про проверку: пакеты xUnit и NSubstitute устанавливаются из NuGet, а в нашей учебной среде NuGet недоступен. Поэтому код с настоящим xUnit в этой теме приведён как образец и не запускался. Зато **все принципы проверены запуском** на собственном «мини-xUnit» из тридцати строк: ты увидишь, как тест-раннер находит тесты по атрибутам, создаёт новый экземпляр класса на каждый тест и как ведут себя `Assert.Throws`, `Theory`, независимость и время.

## Интуиция и аналогия

**Контрольный список пилота.** Пилот перед взлётом проходит чек-лист не потому, что не умеет летать, а потому что цена ошибки высока, а память ненадёжна. Тесты — чек-лист проекта, выполняемый автоматически при каждом изменении.

**Предохранители и сетка под акробатом.** Сетка не мешает работать, но позволяет делать смелые трюки (рефакторинг), не боясь падения. Без неё акробат делает только безопасные движения.

**Тест как спецификация.** Хорошее имя теста — предложение: «закрытие задачи без исполнителя бросает доменное исключение». Список имён тестов читается как перечень правил класса. Если тест красный, имя сразу говорит, какое правило нарушено.

**Градусник, который всегда показывает 36,6.** Тест, который проходит при любом поведении кода (`Assert.NotNull(result)`), хуже отсутствия теста: он создаёт ложную уверенность.

## Основная теория по шагам

### Шаг 1. Подготовка проекта

~~~bash
dotnet new xunit -n TaskBoard.Domain.Tests
dotnet sln add TaskBoard.Domain.Tests
dotnet add TaskBoard.Domain.Tests reference TaskBoard.Domain
dotnet test
~~~

Тестовый проект — обычная библиотека с подключённым тест-фреймворком (xUnit) и ссылкой на проект, который тестируем. `dotnet test` собирает его, находит тесты и запускает; при падении хотя бы одного возвращает ненулевой код выхода — поэтому именно эту команду выполняет CI (см. [CI: GitHub Actions](#p5-ci)).

### Шаг 2. Первый тест: Arrange — Act — Assert

Тест состоит из трёх частей: **Arrange** — подготовить объект и данные; **Act** — выполнить одно проверяемое действие; **Assert** — проверить результат. Вот как он выглядит в xUnit:

~~~csharp TaskBoard.Domain.Tests/TaskItemTests.cs @nocheck
public class TaskItemTests
{
    private static readonly DateTime Now = new(2026, 10, 13, 12, 0, 0, DateTimeKind.Utc);

    [Fact]
    public void Complete_AssignedTask_SetsStatusDoneAndCompletionTime()
    {
        // Arrange — подготовить объект и данные
        var task = new TaskItem(projectId: 1, title: "Форма входа");
        task.AssignTo(userId: 7);

        // Act — одно действие, которое проверяем
        task.Complete(Now);

        // Assert — проверить результат
        Assert.Equal(TaskStatus.Done, task.Status);
        Assert.Equal(Now, task.CompletedAt);
    }

    [Fact]
    public void Complete_AlreadyDone_ThrowsConflict()
    {
        var task = new TaskItem(1, "Форма входа");
        task.AssignTo(7);
        task.Complete(Now);

        Assert.Throws<ConflictException>(() => task.Complete(Now));
    }

    [Fact]
    public void Complete_WithoutAssignee_ThrowsDomainException()
    {
        var task = new TaskItem(1, "Форма входа");

        var ex = Assert.Throws<DomainException>(() => task.Complete(Now));
        Assert.Contains("исполнителя", ex.Message);
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData(null)]
    public void Constructor_EmptyTitle_Throws(string? title)
    {
        Assert.Throws<DomainException>(() => new TaskItem(1, title!));
    }
}
~~~

- `[Fact]` — тест без параметров; `[Theory]` + `[InlineData]` — один тест на несколько наборов данных.
- `Assert.Throws<T>` проверяет **точный** тип исключения. Если нужен «этот тип или наследник» — `Assert.ThrowsAny<T>`.
- Имя теста — спецификация: `Метод_Условие_ОжидаемыйРезультат`. Упавший тест сразу говорит, какое правило нарушено.

Теперь посмотрим, как это работает «изнутри», на нашем мини-xUnit. Ниже: доменный класс `TaskItem`, тесты с теми же атрибутами и крошечный раннер, который находит тесты через рефлексию. Среди тестов есть один намеренно неверный — чтобы увидеть, как выглядит падение и что `Assert.Throws` требует **точного** типа исключения.

~~~csharp
using System.Reflection;

// ====== «тест-фреймворк» из тридцати строк ======
var passed = 0; var failed = 0;
foreach (var type in Assembly.GetExecutingAssembly().GetTypes().Where(t => t.Name.EndsWith("Tests")))
{
    foreach (var method in type.GetMethods().Where(m => m.GetCustomAttribute<FactAttribute>() != null || m.GetCustomAttribute<TheoryAttribute>() != null).OrderBy(m => m.Name, StringComparer.Ordinal))
    {
        var rows = method.GetCustomAttribute<TheoryAttribute>() != null
            ? method.GetCustomAttributes<InlineDataAttribute>().Select(a => a.Data).ToList()
            : new List<object?[]> { Array.Empty<object?>() };

        foreach (var data in rows)
        {
            var instance = Activator.CreateInstance(type)!;           // НОВЫЙ экземпляр класса на каждый запуск
            var label = data.Length == 0 ? method.Name : $"{method.Name}({string.Join(", ", data.Select(a => a is null ? "null" : a.ToString()))})";
            try { method.Invoke(instance, data); passed++; Console.WriteLine($"  [ok]   {label}"); }
            catch (TargetInvocationException e)
            {
                failed++;
                Console.WriteLine($"  [FAIL] {label}\n         {e.InnerException!.Message}");
            }
        }
    }
}
Console.WriteLine($"Пройдено: {passed}, упало: {failed}");

// ====== домен ======
public class DomainException(string message) : Exception(message);
public sealed class ConflictException(string message) : DomainException(message);
public enum TaskStatus { Todo, InProgress, Done }

public sealed class TaskItem
{
    public int ProjectId { get; }
    public string Title { get; }
    public TaskStatus Status { get; private set; } = TaskStatus.Todo;
    public int? AssigneeId { get; private set; }
    public DateTime? CompletedAt { get; private set; }

    public TaskItem(int projectId, string title)
    {
        if (string.IsNullOrWhiteSpace(title)) throw new DomainException("Название задачи обязательно");
        if (title.Trim().Length > 200) throw new DomainException("Название длиннее 200 символов");
        ProjectId = projectId; Title = title.Trim();
    }

    public void AssignTo(int userId)
    {
        if (Status == TaskStatus.Done) throw new ConflictException("Задача уже закрыта");
        AssigneeId = userId;
        if (Status == TaskStatus.Todo) Status = TaskStatus.InProgress;
    }

    public void Complete(DateTime now)
    {
        if (Status == TaskStatus.Done) throw new ConflictException("Задача уже закрыта");
        if (AssigneeId is null) throw new DomainException("Нельзя закрыть задачу без исполнителя");
        Status = TaskStatus.Done; CompletedAt = now;
    }
}

// ====== тесты (как в xUnit) ======
public class TaskItemTests
{
    private static readonly DateTime Now = new(2026, 10, 13, 12, 0, 0, DateTimeKind.Utc);
    private int _counter;                                              // состояние экземпляра

    [Fact]
    public void Complete_AssignedTask_SetsStatusDoneAndCompletionTime()
    {
        var task = new TaskItem(projectId: 1, title: "Форма входа");   // Arrange
        task.AssignTo(userId: 7);

        task.Complete(Now);                                            // Act

        Assert.Equal(TaskStatus.Done, task.Status);                    // Assert
        Assert.Equal(Now, task.CompletedAt);
    }

    [Fact]
    public void Complete_AlreadyDone_ThrowsConflict()
    {
        var task = new TaskItem(1, "Форма входа");
        task.AssignTo(7); task.Complete(Now);

        Assert.Throws<ConflictException>(() => task.Complete(Now));
    }

    [Fact]
    public void Complete_WithoutAssignee_ThrowsDomainException()
    {
        var task = new TaskItem(1, "Форма входа");

        var ex = Assert.Throws<DomainException>(() => task.Complete(Now));
        Assert.Contains("исполнителя", ex.Message);
    }

    [Fact]
    public void AssignTo_TodoTask_MovesToInProgress()
    {
        var task = new TaskItem(1, "Форма входа");
        task.AssignTo(7);
        Assert.Equal(TaskStatus.InProgress, task.Status);
        Assert.Equal(7, task.AssigneeId);
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData(null)]
    public void Constructor_EmptyTitle_Throws(string? title) =>
        Assert.Throws<DomainException>(() => new TaskItem(1, title!));

    [Theory]
    [InlineData(1, true)]
    [InlineData(200, true)]       // ровно на границе — допустимо
    [InlineData(201, false)]      // на единицу больше — нельзя
    public void Constructor_TitleLength_BoundaryIsInclusive(int length, bool valid)
    {
        Action create = () => _ = new TaskItem(1, new string('x', length));
        if (valid) create(); else Assert.Throws<DomainException>(create);
    }

    [Theory]
    [InlineData(1)]
    [InlineData(2)]
    [InlineData(3)]
    public void EachRow_GetsFreshClassInstance(int row)
    {
        _counter++;                                                    // если бы экземпляр был общим, на второй строке было бы 2
        Assert.Equal(1, _counter);
    }

    [Fact]
    public void Complete_Twice_WrongExpectation_FailsBecauseThrowsIsExact()
    {
        var task = new TaskItem(1, "Форма входа");
        task.AssignTo(7); task.Complete(Now);

        Assert.Throws<DomainException>(() => task.Complete(Now));      // бросится ConflictException — наследник, а не DomainException
    }
}

// ====== атрибуты и проверки ======
[AttributeUsage(AttributeTargets.Method)] public class FactAttribute : Attribute { }
[AttributeUsage(AttributeTargets.Method)] public class TheoryAttribute : Attribute { }
[AttributeUsage(AttributeTargets.Method, AllowMultiple = true)]
public class InlineDataAttribute(params object?[] data) : Attribute { public object?[] Data { get; } = data ?? new object?[] { null }; }   // [InlineData(null)] приходит как null-массив

public class AssertException(string message) : Exception(message);
public static class Assert
{
    public static void Equal<T>(T expected, T actual)
    {
        if (!EqualityComparer<T>.Default.Equals(expected, actual)) throw new AssertException($"Assert.Equal() Failure: ожидали {expected}, получили {actual}");
    }
    public static void Contains(string part, string text)
    {
        if (!text.Contains(part)) throw new AssertException($"Assert.Contains() Failure: «{part}» не найдено в «{text}»");
    }
    public static T Throws<T>(Action action) where T : Exception
    {
        try { action(); }
        catch (Exception e)
        {
            if (e.GetType() == typeof(T)) return (T)e;                 // ТОЧНЫЙ тип
            throw new AssertException($"Assert.Throws() Failure: ожидали {typeof(T).Name}, получили {e.GetType().Name}");
        }
        throw new AssertException($"Assert.Throws() Failure: ожидали {typeof(T).Name}, исключения не было");
    }
}
~~~
~~~console
  [ok]   AssignTo_TodoTask_MovesToInProgress
  [ok]   Complete_AlreadyDone_ThrowsConflict
  [ok]   Complete_AssignedTask_SetsStatusDoneAndCompletionTime
  [FAIL] Complete_Twice_WrongExpectation_FailsBecauseThrowsIsExact
         Assert.Throws() Failure: ожидали DomainException, получили ConflictException
  [ok]   Complete_WithoutAssignee_ThrowsDomainException
  [ok]   Constructor_EmptyTitle_Throws()
  [ok]   Constructor_EmptyTitle_Throws(   )
  [ok]   Constructor_EmptyTitle_Throws(null)
  [ok]   Constructor_TitleLength_BoundaryIsInclusive(1, True)
  [ok]   Constructor_TitleLength_BoundaryIsInclusive(200, True)
  [ok]   Constructor_TitleLength_BoundaryIsInclusive(201, False)
  [ok]   EachRow_GetsFreshClassInstance(1)
  [ok]   EachRow_GetsFreshClassInstance(2)
  [ok]   EachRow_GetsFreshClassInstance(3)
Пройдено: 13, упало: 1
~~~

Что здесь важно:

1. Раннер нашёл тесты **по атрибутам** и запустил каждый независимо. Тест `[Theory]` с тремя `[InlineData]` превратился в три прогона.
2. Для каждого прогона создаётся **новый экземпляр** тестового класса: поэтому поле `_counter` на каждой из трёх строк равно единице. Так делает и настоящий xUnit: общее состояние между тестами в полях не передаётся (для общих дорогих ресурсов есть `IClassFixture`).
3. Падение даёт понятное сообщение; имя упавшего теста сразу указывает на нарушенное правило.
4. `Throws<DomainException>` не принял `ConflictException`, хотя он наследник: проверка **точного типа** — документированное поведение `Assert.Throws` в xUnit, для «или наследник» есть `ThrowsAny`.

### Шаг 3. Что тестировать unit-тестами

| Тестировать в первую очередь | Не тратить время |
|---|---|
| Бизнес-правила домена (переходы статусов, ограничения, расчёты) | Геттеры/сеттеры без логики |
| Граничные случаи: ноль, пусто, максимум, ровно на границе | Код фреймворка (что EF сохраняет, что роутинг работает) |
| Ветвления сервисов: «не найдено», «нет прав», «конфликт» | Маппинг «поле в поле» (проверится интеграционными тестами) |
| Найденные баги — **сначала тест, который воспроизводит баг** | Приватные методы напрямую (тестируются через публичные) |

Граничные значения — самая дешёвая и самая результативная категория: ошибки «на единицу» (`<` вместо `<=`) живут именно на границах. В нашем примере теория проверила длину 1, 200 и 201, а не «какую-нибудь длину».

### Шаг 4. Признаки хорошего теста

- **Быстрый** — миллисекунды; без базы, сети, файлов.
- **Независимый** — не зависит от порядка запуска и других тестов; нет общего изменяемого состояния.
- **Детерминированный** — время, случайность, GUID — через абстракции (`TimeProvider`, `IClock`), а не `DateTime.Now`.
- **Проверяет поведение, а не реализацию** — после рефакторинга без изменения поведения тесты остаются зелёными.
- **Одна причина упасть** — тест проверяет одно правило (несколько `Assert` об одном результате — нормально).

Проверим два признака запуском: независимость и детерминизм времени.

~~~csharp
// ---------- 1. Зависимость от порядка запуска ----------
void TestA() { Shared.Log.Add("A"); }
void TestB() { if (Shared.Log.Count != 0) throw new Exception($"ожидали пустой журнал, а там {string.Join(",", Shared.Log)}"); }

string Run(params Action[] tests)
{
    Shared.Log.Clear();
    var results = new List<string>();
    foreach (var t in tests)
    {
        try { t(); results.Add("ok"); } catch (Exception e) { results.Add("ПАДЕНИЕ (" + e.Message + ")"); }
    }
    return string.Join("; ", results);
}

Console.WriteLine("Порядок A, B: " + Run(TestA, TestB));
Console.WriteLine("Порядок B, A: " + Run(TestB, TestA));

// ---------- 2. Время через TimeProvider ----------
var deadline = new DateTimeOffset(2026, 10, 13, 12, 0, 0, TimeSpan.Zero);
var clock = new FixedClock(deadline);
var task = new Deadline(deadline, clock);

Console.WriteLine($"Ровно в срок:      просрочено = {task.IsOverdue()}");
clock.Advance(TimeSpan.FromTicks(1));
Console.WriteLine($"На один тик позже: просрочено = {task.IsOverdue()}");
clock.Advance(TimeSpan.FromDays(-1));
Console.WriteLine($"За сутки до срока: просрочено = {task.IsOverdue()}");

static class Shared { public static readonly List<string> Log = new(); }   // общее изменяемое состояние

sealed class Deadline(DateTimeOffset at, TimeProvider time)
{
    public bool IsOverdue() => time.GetUtcNow() > at;            // не DateTime.UtcNow: время приходит снаружи
}

sealed class FixedClock(DateTimeOffset now) : TimeProvider
{
    private DateTimeOffset _now = now;
    public void Advance(TimeSpan by) => _now += by;
    public override DateTimeOffset GetUtcNow() => _now;
}
~~~
~~~console
Порядок A, B: ok; ПАДЕНИЕ (ожидали пустой журнал, а там A)
Порядок B, A: ok; ok
Ровно в срок:      просрочено = False
На один тик позже: просрочено = True
За сутки до срока: просрочено = False
~~~

Тест B сам по себе правильный: в порядке «B, A» всё зелёное, а в порядке «A, B» он падает, потому что A оставил в общем состоянии мусор. Такие тесты называют «хрупкими» (flaky): на CI и локально они ведут себя по-разному, потому что порядок и параллелизм не гарантированы. Второй пример показывает рецепт для времени: класс получает `TimeProvider` (встроенный в .NET с версии 8), а тест подставляет свой управляемый «часы»; граничный случай «ровно в срок» проверяется точно.

### Шаг 5. Слабые тесты и «проценты покрытия»

Тест можно написать так, что он проходит всегда. Сравним слабую и сильную проверки на коде с багом: метод `Complete` «забыл» записать время закрытия.

~~~csharp
var now = new DateTime(2026, 10, 13, 12, 0, 0, DateTimeKind.Utc);

void Weak(Func<BuggyTask> create)           // «покрытие 100%»: метод вызван, но результат не проверен
{
    var task = create();
    task.Complete(now);
    if (task == null) throw new Exception("null");
}

void Strong(Func<BuggyTask> create)         // проверяет поведение
{
    var task = create();
    task.Complete(now);
    if (task.Done != true) throw new Exception("задача не закрыта");
    if (task.CompletedAt != now) throw new Exception($"время закрытия не записано: {task.CompletedAt?.ToString() ?? "null"}");
}

foreach (var (name, test) in new (string, Action<Func<BuggyTask>>)[] { ("слабый тест", Weak), ("сильный тест", Strong) })
{
    try { test(() => new BuggyTask()); Console.WriteLine($"{name}: прошёл"); }
    catch (Exception e) { Console.WriteLine($"{name}: УПАЛ — {e.Message}"); }
}

sealed class BuggyTask
{
    public bool Done { get; private set; }
    public DateTime? CompletedAt { get; private set; }
    public void Complete(DateTime now) { Done = true; /* баг: забыли CompletedAt = now */ }
}
~~~
~~~console
слабый тест: прошёл
сильный тест: УПАЛ — время закрытия не записано: null
~~~

Строки метода выполнены в обоих случаях, поэтому «процент покрытия» одинаков, а ценность — разная. Сильный тест поймал баг, слабый — нет. Отсюда правило: покрытие показывает, какой код **не** проверялся, но не доказывает, что проверялся хорошо.

:::danger Тесты ради процента покрытия
100% покрытия с тестами, которые ничего не проверяют (вызвал метод, `Assert.NotNull(result)`), хуже, чем 60% осмысленных. Критерий фазы говорит именно об **осмысленных** тестах.
:::

### Шаг 6. Организация: что и как называть

- Один тестовый класс на тестируемый класс: `TaskItemTests` для `TaskItem`.
- Имя — предложение: `Метод_Условие_Результат`. Не `Test1`.
- Данные теста создавай внутри теста или в маленьких вспомогательных методах-«строителях» (`ATask().Assigned()`); не общие поля с изменяемым состоянием.
- Баг найден — сначала тест, который его воспроизводит (красный), потом исправление (зелёный). Это запись истории: баг больше не вернётся незамеченным.
- Тесты читают как документ. Не прячь в них условия и циклы: тест с `if` нуждается в собственных тестах.

## Как это работает под капотом

- **Поиск тестов.** Фреймворк (xUnit) загружает сборку тестов и через рефлексию находит методы с атрибутами `[Fact]`/`[Theory]`. Это ровно то, что делает наш мини-раннер; настоящий отличается богатством возможностей (фикстуры, параллелизм, фильтры, отчёты), а не принципом.
- **Новый экземпляр на каждый тест.** xUnit создаёт новый объект тестового класса для каждого теста (в отличие от некоторых других фреймворков). Поэтому конструктор класса — аналог «SetUp», а `IDisposable.Dispose` — «TearDown». Общие, дорогие в создании ресурсы (запущенный сервер, контейнер базы) выносят в фикстуры (`IClassFixture<T>`, `ICollectionFixture<T>`) — об этом в теме про [интеграционные тесты](#p5-integration).
- **Параллельность.** По умолчанию xUnit запускает **разные тестовые классы параллельно** (каждый класс — своя «коллекция»), а тесты внутри класса последовательно. Поэтому `static`-состояние, которое меняют тесты разных классов, — источник нестабильных тестов, как в нашем примере с порядком.
- **Исключение как способ провала.** `Assert.*` не возвращает результат, а бросает исключение особого типа; раннер перехватывает любое исключение из теста, помечает тест упавшим и печатает сообщение. Поэтому в тесте можно использовать и обычные `throw`.
- **Как `dotnet test` видит результат.** Он запускает тестовый хост, получает от фреймворка результаты по каждому тесту, печатает сводку и возвращает код выхода: 0, если всё зелёное, иначе ненулевой. На этом коде завершения строится проверка в CI.
- **Почему время и случайность нужно подменять.** Детерминированность — главное свойство теста: при тех же входных данных он обязан давать тот же результат. `DateTime.UtcNow`, `Random`, `Guid.NewGuid()` вносят в код скрытые входные данные. Встроенный `TimeProvider` (.NET 8+) и собственные интерфейсы (`IClock`, `IIdGenerator`) делают эти входы явными.
- **Покрытие кода.** Инструменты покрытия (Coverlet) считают, какие строки и ветки выполнялись во время тестов. Это карта «слепых зон», а не оценка качества тестов. Мутационное тестирование (Stryker.NET) идёт дальше: ломает код и проверяет, упал ли хоть один тест.

## Типичные ошибки и ловушки

- **Тесты без проверок или со слабыми проверками** (`Assert.NotNull(result)`, `Assert.True(true)`). Создают ложное чувство безопасности.
- **Погоня за процентом покрытия.** Метрика цели не заменяет вопрос «поймает ли этот тест реальный баг?».
- **Зависимость от `DateTime.Now`, `Random`, `Guid.NewGuid()`.** Тест «просрочки» пройдёт сегодня и упадёт завтра.
- **Общее изменяемое состояние между тестами** (статические поля, общий список). Порядок и параллелизм превращаются в источник случайных падений.
- **Один тест — много сценариев.** Упал — неясно, что именно сломалось. Один тест — одно правило.
- **Тестирование реализации, а не поведения.** Тест ломается при каждом рефакторинге.
- **Тестирование приватных методов напрямую** через рефлексию: проверяй через публичный интерфейс.
- **Тесты, зависящие от внешних систем** (реальная база, сеть, файловая система) под видом unit-тестов: медленные, нестабильные.
- **Логика в тесте** (циклы, `if`, вычисление ожидаемого значения тем же алгоритмом, что и в коде): ожидаемое значение пиши константой.
- **Непонятные имена** (`Test1`, `ShouldWork`).
- **Игнорирование падающих тестов** (`[Fact(Skip = "...")]` навсегда): набор тестов, которому не доверяют, никто не запускает.
- **Исправление бага без теста.** Баг вернётся.

## Вопросы с собеседований

:::spoiler Что такое AAA?
Arrange — Act — Assert: подготовить данные и объект, выполнить одно проверяемое действие, проверить результат. Структура делает тест читаемым и не даёт смешивать несколько сценариев.
:::

:::spoiler Почему тест не должен зависеть от DateTime.Now?
Результат будет зависеть от момента запуска: тест «просрочки» пройдёт сегодня и упадёт завтра. Время передаётся через абстракцию (`TimeProvider`, `IClock`) и фиксируется в тесте.
:::

:::spoiler Чем `[Fact]` отличается от `[Theory]`?
`[Fact]` — тест без параметров, выполняется один раз. `[Theory]` — параметризованный тест, который выполняется для каждого набора данных (`[InlineData]`, `[MemberData]`), удобен для граничных значений.
:::

:::spoiler Что делает тест хорошим?
Быстрый, независимый от порядка и других тестов, детерминированный, проверяет поведение, а не реализацию, падает по одной причине и называется как спецификация.
:::

:::spoiler Достаточно ли 100% покрытия кода тестами? (ловушка: «да, значит всё проверено»)
Нет. Покрытие показывает, что строки выполнялись, но не что их результат проверен. Тест без осмысленных `Assert` даёт полное покрытие и нулевую защиту.
:::

:::spoiler Что проверяет `Assert.Throws<T>`: точный тип или наследников? (ловушка)
Точный тип. Для «этот тип или наследник» используется `Assert.ThrowsAny<T>`.
:::

:::spoiler Как тестировать код, который использует текущее время или случайные числа?
Вынести их за интерфейс или `TimeProvider`, передавать зависимость в конструктор, в тесте подставлять управляемую реализацию (фиксированные часы, предсказуемый генератор).
:::

:::spoiler Что такое flaky-тест и как с ним бороться?
Тест, который иногда проходит, иногда падает без изменения кода. Причины: порядок, общее состояние, время, параллелизм, внешние системы. Лечение — изоляция, детерминированные входы, подмена зависимостей; нельзя «перезапускать до зелёного».
:::

:::spoiler Что тестировать в первую очередь?
Бизнес-правила, граничные случаи и ветвления сервисов (ошибки), а также каждый найденный баг — начиная с теста, который его воспроизводит.
:::

## Что запомнить

- Unit-тест быстрый, изолированный (без базы, сети, файлов), по схеме Arrange — Act — Assert, одно правило на тест.
- `[Fact]` — один сценарий, `[Theory]` + `[InlineData]` — таблица значений; тестируй границы (0, пусто, максимум, ровно на границе, на единицу больше).
- Имя теста — спецификация: `Метод_Условие_Результат`.
- xUnit создаёт новый экземпляр класса на каждый тест; общее состояние между тестами и параллельный запуск классов — источники нестабильности.
- `Assert.Throws<T>` проверяет точный тип исключения; для наследников — `ThrowsAny`.
- Время, случайность, GUID — через `TimeProvider`/интерфейсы; `DateTime.Now` в коде под тестом делает тест недетерминированным.
- Процент покрытия — карта слепых зон, а не оценка качества; слабые проверки опаснее отсутствия теста.
- Баг? Сначала красный тест, потом исправление.

## Практика

- [ ] Создал тестовый проект для домена, написал 15+ тестов на правила сущностей
- [ ] Для каждого бизнес-правила проекта есть хотя бы один позитивный и один негативный тест
- [ ] Использовал `[Theory]` для граничных значений
- [ ] Нашёл в проекте баг через тест (или воспроизвёл известный баг тестом, затем исправил)

@@page id="p5-mocks" phase="5" kind="topic" title="Тестовые двойники, моки и TDD" nav="Моки и TDD" est="~1 неделя"
:::why
Сервисы зависят от репозиториев, часов, отправки писем. Чтобы тестировать **логику сервиса**, а не базу и SMTP, зависимости подменяют двойниками. TDD — способ писать код так, что тесты появляются сами и проектируют API.
:::

## Зачем это нужно

Сервис приложения почти никогда не работает один: он берёт задачу из репозитория, спрашивает время у часов, сохраняет изменения, отправляет уведомление. Если тестировать его «как есть», в тест придётся тянуть настоящую базу, SMTP-сервер и системные часы. Такой тест медленный, нестабильный (SMTP недоступен — тест красный) и проверяет не то, что мы хотели: нас интересует **логика сервиса** (что он решает при «не найдено», «нет прав», «конфликт»), а не работа PostgreSQL.

Решение — **тестовые двойники**: объекты, которые подставляются вместо настоящих зависимостей и ведут себя предсказуемо. Они возможны, потому что сервис получает зависимости через конструктор (внедрение зависимостей, [DI](#p4-di)) и общается с ними через интерфейсы. Сама архитектура Фазы 4 («слои, зависимости направлены внутрь») и нужна, в том числе, чтобы код можно было тестировать.

**TDD** (разработка через тестирование) — вторая половина темы. Это дисциплина: сначала пишешь падающий тест на желаемое поведение, затем минимальный код, чтобы он прошёл, затем улучшаешь код. Она не обязательна, но даёт важный эффект: тест, написанный до кода, проектирует удобный интерфейс и подтверждает, что проверяет именно то, что нужно.

Что ты получишь от темы:

- различать виды двойников (dummy, stub, spy, mock, fake) и выбирать нужный;
- понимать, что делают библиотеки вроде NSubstitute «под капотом»;
- отличать тест поведения от теста реализации и видеть, как вторые ломаются при рефакторинге;
- пройти цикл red → green → refactor на реальном примере;
- отвечать на вопросы собеседований: «чем mock отличается от stub», «что мокать, а что нет», «что такое TDD и зачем нужен красный шаг».

Про проверку: библиотека NSubstitute (и Moq) ставится из NuGet, а в нашей учебной среде NuGet недоступен. Поэтому код с NSubstitute приведён как образец и не запускался. Но все принципы проверены на двойниках, написанных руками, и на мини-аналоге NSubstitute, собранном на встроенном в .NET классе `DispatchProxy`: ты увидишь, как именно такие библиотеки создают заместителей интерфейсов и записывают вызовы.

## Интуиция и аналогия

**Тренировочный манекен для краш-теста.** Автопроизводитель не сажает в машину живого человека: используется манекен с датчиками. Он ведёт себя предсказуемо, а датчики записывают, что произошло. Двойник в тесте — манекен: не настоящая зависимость, а её управляемая замена.

**Актёр-дублёр, суфлёр и репетиция.** Stub — дублёр, который произносит заученные реплики. Mock — режиссёр с блокнотом: он не только слушает реплики, но и проверяет, что актёр вышел в нужную сцену нужное число раз. Fake — упрощённая, но рабочая декорация: дверь действительно открывается, хотя за ней нарисованная стена.

**Свидетель, а не следователь.** Хороший тест проверяет **результат** («задача закрыта, время записано») — как если бы вы смотрели на итог работы. Слишком «мок-ориентированный» тест проверяет, **как** сервис это сделал («вызвал метод A, затем B, ровно один раз»), — то есть следит за методом работы. Метод легко меняется без изменения результата, и такие тесты ломаются зря.

**Красный светофор перед стартом.** Красный шаг TDD — проверка, что сигнал вообще работает: тест, который никогда не бывает красным, может быть сломан.

## Основная теория по шагам

### Шаг 1. Виды тестовых двойников

| Двойник | Что делает | Пример |
|---|---|---|
| **Dummy** | просто занимает место в конструкторе, не используется | `null`-логгер или пустая заглушка |
| **Stub** | возвращает заранее заданные ответы | репозиторий всегда возвращает задачу №42 |
| **Spy** | отвечает как stub и записывает вызовы, а проверяет их уже тест | считает вызовы `SaveChangesAsync` |
| **Mock** | заранее знает ожидаемые вызовы и сам падает, если их не было | «`SaveChangesAsync` вызван ровно один раз» |
| **Fake** | упрощённая рабочая реализация | `InMemoryTaskRepository`, `FixedClock` |

На практике в .NET слова «mock» и «мокать» относят ко всем этим видам. Различие полезно знать, потому что оно подсказывает, что проверять: **возвращаемое значение и состояние** (stub, fake) или **взаимодействие** (spy, mock).

Покажем все двойники в деле — написанные руками, без библиотек. Сервис закрывает задачу: берёт её из репозитория, закрывает на текущее время и сохраняет.

~~~csharp
async Task Check(string name, Func<Task> test)
{
    try { await test(); Console.WriteLine($"[ok]   {name}"); }
    catch (Exception e) { Console.WriteLine($"[FAIL] {name}: {e.Message}"); }
}
void True(bool condition, string message) { if (!condition) throw new Exception(message); }

var now = new DateTimeOffset(2026, 10, 13, 12, 0, 0, TimeSpan.Zero);

await Check("успех: задача закрыта и сохранена (stub + spy + fake clock)", async () =>
{
    var task = new TaskItem(1, "Форма входа"); task.AssignTo(7);
    var repo = new SpyRepository(task);                          // stub: отдаёт заготовленную задачу; spy: считает сохранения
    var service = new TaskService(repo, new FixedClock(now));    // fake: часы показывают заданное время

    await service.CompleteAsync(42, CancellationToken.None);

    True(task.Status == TaskStatus.Done, "задача не закрыта");
    True(task.CompletedAt == now.UtcDateTime, "время закрытия неверное");
    True(repo.SaveCalls == 1, $"ожидали одно сохранение, было {repo.SaveCalls}");
});

await Check("не найдено: исключение, сохранения нет", async () =>
{
    var repo = new SpyRepository(null);                          // stub возвращает «ничего»
    var service = new TaskService(repo, new FixedClock(now));

    try { await service.CompleteAsync(99, CancellationToken.None); throw new Exception("исключения не было"); }
    catch (NotFoundException) { }

    True(repo.SaveCalls == 0, "при ошибке сохранять нельзя");
});

await Check("fake-репозиторий: проверяем итоговое состояние, а не вызовы", async () =>
{
    var repo = new InMemoryRepository();
    var task = new TaskItem(1, "Форма входа"); task.AssignTo(7);
    repo.Add(42, task);
    var service = new TaskService(repo, new FixedClock(now));

    await service.CompleteAsync(42, CancellationToken.None);

    var stored = await repo.FindAsync(42, CancellationToken.None);
    True(stored!.Status == TaskStatus.Done && stored.CompletedAt == now.UtcDateTime, "в «базе» задача не закрыта");
});

await Check("правило домена доходит до сервиса: без исполнителя — DomainException", async () =>
{
    var repo = new InMemoryRepository();
    repo.Add(42, new TaskItem(1, "Форма входа"));
    var service = new TaskService(repo, new FixedClock(now));

    try { await service.CompleteAsync(42, CancellationToken.None); throw new Exception("исключения не было"); }
    catch (DomainException e) when (e.GetType() == typeof(DomainException)) { }
});

// ====== код под тестом ======
public interface ITaskRepository
{
    Task<TaskItem?> FindAsync(int id, CancellationToken ct);
    Task SaveChangesAsync(CancellationToken ct);
}

public sealed class TaskService(ITaskRepository repo, TimeProvider clock)
{
    public async Task CompleteAsync(int id, CancellationToken ct)
    {
        var task = await repo.FindAsync(id, ct) ?? throw new NotFoundException($"Задача {id} не найдена");
        task.Complete(clock.GetUtcNow().UtcDateTime);
        await repo.SaveChangesAsync(ct);
    }
}

// ====== двойники ======
public sealed class SpyRepository(TaskItem? task) : ITaskRepository
{
    public int SaveCalls { get; private set; }
    public Task<TaskItem?> FindAsync(int id, CancellationToken ct) => Task.FromResult(task);   // всегда одно и то же
    public Task SaveChangesAsync(CancellationToken ct) { SaveCalls++; return Task.CompletedTask; }
}

public sealed class InMemoryRepository : ITaskRepository
{
    private readonly Dictionary<int, TaskItem> _items = new();
    public void Add(int id, TaskItem item) => _items[id] = item;
    public Task<TaskItem?> FindAsync(int id, CancellationToken ct) => Task.FromResult(_items.GetValueOrDefault(id));
    public Task SaveChangesAsync(CancellationToken ct) => Task.CompletedTask;
}

public sealed class FixedClock(DateTimeOffset now) : TimeProvider
{
    public override DateTimeOffset GetUtcNow() => now;
}

// ====== домен ======
public class DomainException(string message) : Exception(message);
public sealed class ConflictException(string message) : DomainException(message);
public sealed class NotFoundException(string message) : DomainException(message);
public enum TaskStatus { Todo, InProgress, Done }

public sealed class TaskItem(int projectId, string title)
{
    public TaskStatus Status { get; private set; } = TaskStatus.Todo;
    public int? AssigneeId { get; private set; }
    public DateTime? CompletedAt { get; private set; }

    public void AssignTo(int userId) { AssigneeId = userId; if (Status == TaskStatus.Todo) Status = TaskStatus.InProgress; }
    public void Complete(DateTime now)
    {
        if (Status == TaskStatus.Done) throw new ConflictException("Задача уже закрыта");
        if (AssigneeId is null) throw new DomainException("Нельзя закрыть задачу без исполнителя");
        Status = TaskStatus.Done; CompletedAt = now;
    }
}
~~~
~~~console
[ok]   успех: задача закрыта и сохранена (stub + spy + fake clock)
[ok]   не найдено: исключение, сохранения нет
[ok]   fake-репозиторий: проверяем итоговое состояние, а не вызовы
[ok]   правило домена доходит до сервиса: без исполнителя — DomainException
~~~

Обрати внимание на два способа проверить один и тот же сервис. Первые два теста смотрят на **взаимодействие** (сколько раз вызвали сохранение), третий — на **состояние** (что лежит в «базе» после операции). Состояние устойчивее, потому что не зависит от того, какими именно вызовами сервис к нему пришёл.

### Шаг 2. NSubstitute: как это выглядит в проекте

В настоящем проекте руками двойники пишут редко: библиотека генерирует заместителя интерфейса на лету.

~~~bash
dotnet add package NSubstitute
~~~

~~~csharp TaskServiceTests.cs @nocheck
using NSubstitute;

public class TaskServiceTests
{
    private static readonly DateTime Now = new(2026, 10, 13, 12, 0, 0, DateTimeKind.Utc);
    private readonly ITaskRepository _repo = Substitute.For<ITaskRepository>();
    private readonly IClock _clock = Substitute.For<IClock>();
    private readonly TaskService _service;

    public TaskServiceTests()
    {
        _clock.UtcNow.Returns(Now);
        _service = new TaskService(_repo, _clock);
    }

    [Fact]
    public async Task CompleteAsync_ExistingAssignedTask_CompletesAndSaves()
    {
        var task = new TaskItem(1, "Форма входа");
        task.AssignTo(7);
        _repo.FindAsync(42, Arg.Any<CancellationToken>()).Returns(Task.FromResult<TaskItem?>(task));

        await _service.CompleteAsync(42, CancellationToken.None);

        Assert.Equal(TaskStatus.Done, task.Status);
        await _repo.Received(1).SaveChangesAsync(Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task CompleteAsync_UnknownTask_ThrowsNotFoundAndDoesNotSave()
    {
        _repo.FindAsync(99, Arg.Any<CancellationToken>()).Returns(Task.FromResult<TaskItem?>(null));

        await Assert.ThrowsAsync<NotFoundException>(() => _service.CompleteAsync(99, CancellationToken.None));
        await _repo.DidNotReceive().SaveChangesAsync(Arg.Any<CancellationToken>());
    }
}
~~~

~~~csharp То же самое на Moq (встретишь в чужих проектах) @nocheck
var repo = new Mock<ITaskRepository>();
repo.Setup(r => r.FindAsync(42, It.IsAny<CancellationToken>())).ReturnsAsync(task);
var service = new TaskService(repo.Object, clock);

await service.CompleteAsync(42, CancellationToken.None);

repo.Verify(r => r.SaveChangesAsync(It.IsAny<CancellationToken>()), Times.Once);
~~~

Как это устроено, мы проверим на своём мини-аналоге. В .NET есть встроенный `DispatchProxy` — он во время выполнения создаёт класс, реализующий интерфейс, и направляет **каждый вызов метода** в наш метод `Invoke`. Вот на этом принципе (у NSubstitute и Moq в основе похожий механизм, библиотека Castle DynamicProxy) и строятся `Substitute.For<T>()`, `Returns` и `Received`:

~~~csharp
using System.Reflection;

var calls = new List<string>();
var repo = MiniSubstitute.For<ITaskRepository>(calls,
    returns: new() { ["FindAsync"] = new TaskItem(1, "Форма входа") });       // как .Returns(...)

var found = await repo.FindAsync(42, CancellationToken.None);
await repo.SaveChangesAsync(CancellationToken.None);

Console.WriteLine($"Заместитель — не интерфейс, а класс, сгенерированный во время выполнения: {!repo.GetType().IsInterface && repo.GetType().Assembly != typeof(ITaskRepository).Assembly}");
Console.WriteLine($"Заместитель вернул заготовленную задачу: {found!.Title}");
Console.WriteLine($"Записанные вызовы: {string.Join(" → ", calls)}");
Console.WriteLine($"Received(1).SaveChangesAsync: {calls.Count(c => c == "SaveChangesAsync") == 1}");
Console.WriteLine($"DidNotReceive.Delete: {!calls.Contains("Delete")}");

// метод, для которого ничего не настроили, возвращает значение по умолчанию (как NSubstitute)
var empty = MiniSubstitute.For<ITaskRepository>(new List<string>(), new());
Console.WriteLine($"Не настроено → FindAsync вернул null: {(await empty.FindAsync(1, CancellationToken.None)) is null}");

public interface ITaskRepository
{
    Task<TaskItem?> FindAsync(int id, CancellationToken ct);
    Task SaveChangesAsync(CancellationToken ct);
}
public sealed record TaskItem(int ProjectId, string Title);

public class MiniSubstitute<T> : DispatchProxy
{
    public List<string> Calls = new();
    public Dictionary<string, object?> Returns = new();

    protected override object? Invoke(MethodInfo? method, object?[]? args)
    {
        Calls.Add(method!.Name);                                          // запись вызова — основа Received()
        Returns.TryGetValue(method.Name, out var value);                  // заранее настроенный ответ — основа Returns()
        var type = method.ReturnType;
        if (type == typeof(Task)) return Task.CompletedTask;
        if (type.IsGenericType && type.GetGenericTypeDefinition() == typeof(Task<>))
            return typeof(Task).GetMethod(nameof(Task.FromResult))!.MakeGenericMethod(type.GetGenericArguments()[0]).Invoke(null, new[] { value });
        return value;
    }
}

public static class MiniSubstitute
{
    public static T For<T>(List<string> calls, Dictionary<string, object?> returns) where T : class
    {
        var proxy = DispatchProxy.Create<T, MiniSubstitute<T>>();
        var impl = (MiniSubstitute<T>)(object)proxy;
        impl.Calls = calls; impl.Returns = returns;
        return proxy;
    }
}
~~~
~~~console
Заместитель — не интерфейс, а класс, сгенерированный во время выполнения: True
Заместитель вернул заготовленную задачу: Форма входа
Записанные вызовы: FindAsync → SaveChangesAsync
Received(1).SaveChangesAsync: True
DidNotReceive.Delete: True
Не настроено → FindAsync вернул null: True
~~~

Это и есть вся «магия»: заместитель записывает каждый вызов и отвечает заготовленными значениями. `Received` — это просто проверка записанного журнала, а `Arg.Any<T>()` — условие сравнения аргументов при поиске подходящей записи. Заместитель можно создать только для **интерфейса** (или класса с виртуальными членами, которые можно перехватить) — поэтому код, рассчитанный на тестирование, зависит от интерфейсов, а не от конкретных классов.

### Шаг 3. Тест поведения против теста реализации

Проверим главный совет «предпочитай результат и состояние». Рефакторинг: сервис теперь загружает задачу другим методом репозитория (`GetForUpdateAsync`) — результат работы тот же. Посмотрим, какие тесты это переживут:

~~~csharp
var now = new DateTimeOffset(2026, 10, 13, 12, 0, 0, TimeSpan.Zero);

async Task<(bool interactionOk, bool stateOk)> RunBoth(Func<ITaskRepository, TimeProvider, ICompleter> create)
{
    var repo = new RecordingRepository();
    var task = new TaskItem(); repo.Add(42, task);
    await create(repo, new FixedClock(now)).CompleteAsync(42);

    bool interaction = repo.Calls.Contains("FindAsync");        // тест, привязанный к реализации: «вызвали FindAsync»
    bool state = task.Done && task.CompletedAt == now.UtcDateTime;   // тест результата: «задача закрыта и время записано»
    return (interaction, state);
}

var v1 = await RunBoth((r, c) => new ServiceV1(r, c));
var v2 = await RunBoth((r, c) => new ServiceV2(r, c));

Console.WriteLine($"Версия 1:                     тест «вызван FindAsync»: {(v1.interactionOk ? "зелёный" : "КРАСНЫЙ")}, тест «задача закрыта»: {(v1.stateOk ? "зелёный" : "КРАСНЫЙ")}");
Console.WriteLine($"Версия 2 (после рефакторинга): тест «вызван FindAsync»: {(v2.interactionOk ? "зелёный" : "КРАСНЫЙ")}, тест «задача закрыта»: {(v2.stateOk ? "зелёный" : "КРАСНЫЙ")}");

public interface ICompleter { Task CompleteAsync(int id); }
public interface ITaskRepository
{
    Task<TaskItem?> FindAsync(int id);
    Task<TaskItem?> GetForUpdateAsync(int id);
}

public sealed class ServiceV1(ITaskRepository repo, TimeProvider clock) : ICompleter
{
    public async Task CompleteAsync(int id)
    {
        var task = await repo.FindAsync(id) ?? throw new InvalidOperationException("нет задачи");
        task.Complete(clock.GetUtcNow().UtcDateTime);
    }
}

public sealed class ServiceV2(ITaskRepository repo, TimeProvider clock) : ICompleter      // тот же результат, другой способ загрузки
{
    public async Task CompleteAsync(int id)
    {
        var task = await repo.GetForUpdateAsync(id) ?? throw new InvalidOperationException("нет задачи");
        task.Complete(clock.GetUtcNow().UtcDateTime);
    }
}

public sealed class RecordingRepository : ITaskRepository
{
    private readonly Dictionary<int, TaskItem> _items = new();
    public List<string> Calls { get; } = new();
    public void Add(int id, TaskItem t) => _items[id] = t;
    public Task<TaskItem?> FindAsync(int id) { Calls.Add("FindAsync"); return Task.FromResult(_items.GetValueOrDefault(id)); }
    public Task<TaskItem?> GetForUpdateAsync(int id) { Calls.Add("GetForUpdateAsync"); return Task.FromResult(_items.GetValueOrDefault(id)); }
}

public sealed class FixedClock(DateTimeOffset now) : TimeProvider { public override DateTimeOffset GetUtcNow() => now; }
public sealed class TaskItem
{
    public bool Done { get; private set; }
    public DateTime? CompletedAt { get; private set; }
    public void Complete(DateTime now) { Done = true; CompletedAt = now; }
}
~~~
~~~console
Версия 1:                     тест «вызван FindAsync»: зелёный, тест «задача закрыта»: зелёный
Версия 2 (после рефакторинга): тест «вызван FindAsync»: КРАСНЫЙ, тест «задача закрыта»: зелёный
~~~

Тест взаимодействия «сломался» после безобидного рефакторинга, хотя поведение системы не изменилось; тест результата остался зелёным. Отсюда правило: **`Received`/`Verify` используй только для важных побочных эффектов**, которые и есть смысл операции (сохранение, отправка письма, публикация события), а остальное проверяй по результату и состоянию.

:::warn Не мокай всё подряд
- Мокай **границы** (репозитории, внешние сервисы, часы), а не доменные объекты — их проще создать настоящими.
- Если для теста нужно настроить 8 моков — у сервиса слишком много зависимостей (сигнал к рефакторингу).
- Проверка «вызвал метод X с аргументом Y» привязывает тест к реализации. Предпочитай проверять **результат и состояние**, а `Received` — только для важных побочных эффектов (сохранение, отправка письма).
:::

### Шаг 4. TDD: red → green → refactor

1. **Red** — напиши тест на ещё не существующее поведение. Убедись, что он падает (и по правильной причине).
2. **Green** — напиши **минимальный** код, чтобы тест прошёл.
3. **Refactor** — улучши код и тесты, не меняя поведения; тесты остаются зелёными.

~~~csharp Пример цикла: штраф за просрочку @nocheck
// RED: тест на правило, которого ещё нет
[Theory]
[InlineData(0, 0)]       // в срок — без штрафа
[InlineData(1, 10)]      // 1 день — 10
[InlineData(30, 300)]
[InlineData(100, 500)]   // максимум 500
public void Calculate_DaysLate_ReturnsCappedFine(int daysLate, int expected)
{
    var policy = new FinePolicy(perDay: 10m, cap: 500m);
    Assert.Equal(expected, policy.Calculate(daysLate));
}

// GREEN: минимальная реализация
public sealed class FinePolicy(decimal perDay, decimal cap)
{
    public decimal Calculate(int daysLate) => daysLate <= 0 ? 0m : Math.Min(daysLate * perDay, cap);
}

// REFACTOR: например, вынести настройки в Options, добавить тест на отрицательные дни
~~~

Теперь проследим цикл по шагам на живом коде: одна и та же таблица тестов запускается против последовательных версий реализации. Видно, как каждый шаг «подтягивается» очередным тестом.

~~~csharp
var cases = new (int DaysLate, decimal Expected)[] { (0, 0m), (1, 10m), (30, 300m), (100, 500m), (-5, 0m) };

void Run(string stage, Func<int, decimal> calculate)
{
    var report = cases.Select(c =>
    {
        decimal got;
        try { got = calculate(c.DaysLate); } catch (NotImplementedException) { return $"{c.DaysLate}: не реализовано"; }
        return got == c.Expected ? $"{c.DaysLate}: ok" : $"{c.DaysLate}: ожидали {c.Expected}, получили {got}";
    });
    var failed = report.Count(r => !r.EndsWith("ok"));
    Console.WriteLine($"{stage,-34} упало {failed} из {cases.Length} → {string.Join("; ", report)}");
}

decimal perDay = 10m, cap = 500m;

Run("RED 1 (бросает NotImplemented)",        d => throw new NotImplementedException());
Run("RED 2 (заглушка возвращает 0)",         d => 0m);                                   // строка «0 дней» проходит случайно!
Run("GREEN 1 (минимум: дни × ставка)",       d => d * perDay);                           // нет верхней границы и отрицательных дней
Run("GREEN 2 (добавили верхнюю границу)",    d => Math.Min(d * perDay, cap));            // отрицательные дни дают отрицательный штраф
Run("GREEN 3 (учли отрицательные дни)",      d => d <= 0 ? 0m : Math.Min(d * perDay, cap));
~~~
~~~console
RED 1 (бросает NotImplemented)     упало 5 из 5 → 0: не реализовано; 1: не реализовано; 30: не реализовано; 100: не реализовано; -5: не реализовано
RED 2 (заглушка возвращает 0)      упало 3 из 5 → 0: ok; 1: ожидали 10, получили 0; 30: ожидали 300, получили 0; 100: ожидали 500, получили 0; -5: ok
GREEN 1 (минимум: дни × ставка)    упало 2 из 5 → 0: ok; 1: ok; 30: ok; 100: ожидали 500, получили 1000; -5: ожидали 0, получили -50
GREEN 2 (добавили верхнюю границу) упало 1 из 5 → 0: ok; 1: ok; 30: ok; 100: ok; -5: ожидали 0, получили -50
GREEN 3 (учли отрицательные дни)   упало 0 из 5 → 0: ok; 1: ok; 30: ok; 100: ok; -5: ok
~~~

Две лекции в одном выводе. Первая: на шаге RED 2 строки «0 дней» и «−5 дней» **прошли**, хотя кода нет: заглушка `return 0` случайно совпала с ожиданием. Поэтому красный шаг важно просматривать глазами: зелёные строки не должны обманывать, а в таблице должны быть значения, при которых заглушка не совпадёт. Вторая: минимальная реализация не обязана быть сразу полной — следующие строки таблицы (`100` — граница, `-5` — отрицательное) последовательно «вытягивают» из кода недостающие правила.

:::tip TDD «хотя бы частично»
Роадмап не требует писать всё по TDD. Хорошая точка входа: **каждый баг** и **каждое новое бизнес-правило** начинай с падающего теста. Это приучает к ритму без догматизма.
:::

## Как это работает под капотом

- **Внедрение зависимостей делает двойники возможными.** Сервис получает `ITaskRepository` и `TimeProvider` через конструктор, не создавая их сам. Тест вызывает тот же конструктор, но передаёт заместителей. Если сервис делает `new SqlRepository()` внутри или обращается к `DateTime.UtcNow`, подменить нечего.
- **Как создаётся заместитель.** Библиотека во время выполнения генерирует новый класс, реализующий интерфейс (через `System.Reflection.Emit`; в нашем мини-примере — `DispatchProxy`). Все методы этого класса направлены в общий обработчик, который ищет настроенный ответ и записывает вызов. Поэтому заместитель можно создать для интерфейса или для класса с виртуальными методами; невиртуальный метод перехватить нельзя.
- **`Returns` и аргументы.** Настройка `repo.FindAsync(42, Arg.Any<CancellationToken>()).Returns(...)` выглядит как вызов метода, но на самом деле это вызов заместителя в режиме «запомни последнее обращение»: библиотека запоминает аргументы и привязывает к ним ответ. Следующий вызов с подходящими аргументами вернёт настроенное значение.
- **Что возвращает ненастроенный метод.** Для ссылочных типов — `null`, для чисел — ноль; для `Task` — уже завершённая задача; библиотеки вроде NSubstitute возвращают также «авто-заместителей» для интерфейсов. Из-за этого тест может молча пройти с пустыми данными — пиши настройку явно.
- **Почему поведение стабильнее реализации.** Публичное поведение — контракт; выбор методов репозитория, число вызовов, порядок — внутренности. Когда тест фиксирует внутренности, любой рефакторинг ломает его без пользы.
- **Fake против mock.** Fake реализует настоящую логику упрощённо (словарь вместо таблицы), поэтому разные сценарии работают «из коробки»: добавил — нашёл — удалил. Mock пришлось бы настраивать каждый раз. Fake для репозитория нельзя считать гарантией SQL-поведения (уникальные индексы, транзакции): это покрывают интеграционные тесты ([следующая тема](#p5-integration)).
- **Тестовая пирамида.** Много быстрых unit-тестов с двойниками на нижнем уровне, меньше интеграционных, ещё меньше сквозных. Двойники нужны на нижнем уровне; чем выше, тем больше используем настоящие компоненты.
- **Почему красный шаг TDD нужен технически.** Он проверяет сам тест: если тест проходит без нового кода, он ничего не проверяет. Как мы видели, даже заглушка может случайно удовлетворить часть таблицы.

## Типичные ошибки и ловушки

- **Мокать всё подряд**, включая доменные объекты и простые значения. Тест превращается в пересказ реализации.
- **Слишком много зависимостей и моков в одном тесте.** Сигнал к рефакторингу самого сервиса, а не к «мок-фреймворку получше».
- **Проверка взаимодействия там, где важен результат** (`Received` на каждый вызов). Тест ломается при любом рефакторинге.
- **Ненастроенный мок возвращает `null`/пусто.** Тест проходит «в пустоте» или падает `NullReferenceException` в неожиданном месте.
- **Мок вместо fake для репозитория с логикой запросов.** Придётся настраивать каждый запрос; логика фильтрации в тест не попадёт.
- **Верить fake в вопросах SQL.** In-memory словарь не знает про уникальные индексы, транзакции, коллации.
- **Настраивать мок, не проверяя результат.** Тест «проходит», потому что ничего не утверждает.
- **Мокать то, чем владеешь не ты** (чужие классы без интерфейсов): лучше завернуть в свой интерфейс-адаптер и мокать его.
- **Пропускать красный шаг TDD.** Тест без падения не доказывает, что он проверяет нужное.
- **Писать сразу «идеальную» реализацию на зелёном шаге.** Теряется связь «тест → код»; дописывай ровно под следующий тест.
- **Тесты в TDD без рефакторинга.** Дублирование накапливается и в коде, и в тестах.
- **Догматизм.** TDD полезен там, где известно ожидаемое поведение (правила, расчёты, баги); для исследовательского кода лучше сначала поэкспериментировать.

## Вопросы с собеседований

:::spoiler Чем mock отличается от stub?
Stub только возвращает подготовленные данные. Mock дополнительно проверяет взаимодействие: был ли вызов, сколько раз, с какими аргументами.
:::

:::spoiler Зачем на шаге Red убеждаться, что тест падает?
Тест, который проходит до написания кода, ничего не проверяет (ошибка в тесте или поведение уже есть). Падение по ожидаемой причине доказывает, что тест чувствителен к нужному поведению.
:::

:::spoiler Что можно мокать, а что нет? (ловушка: «всё, что мешает тесту»)
Мокают границы системы: репозитории, внешние сервисы, часы, почту. Доменные объекты и простые значения создают настоящими. Чужие типы без интерфейсов оборачивают в свой адаптер.
:::

:::spoiler Когда fake лучше mock?
Когда зависимость имеет состояние и несколько операций (репозиторий: добавить, найти, обновить). Fake ведёт себя как настоящая и позволяет проверять итоговое состояние, а не последовательность вызовов.
:::

:::spoiler Почему тест, привязанный к вызовам методов, плох? (ловушка)
Он проверяет реализацию, а не поведение: любой рефакторинг (другой метод репозитория, другое число вызовов) ломает тест, хотя результат тот же. Взаимодействие проверяют только для важных побочных эффектов.
:::

:::spoiler Как работает библиотека для создания моков (NSubstitute, Moq) в общих чертах?
Во время выполнения генерируется класс, реализующий интерфейс; его методы перенаправляются в общий обработчик, который записывает вызовы и возвращает настроенные значения. Поэтому мокаются интерфейсы и виртуальные методы.
:::

:::spoiler Что такое TDD и обязательно ли использовать его всегда?
Цикл red → green → refactor: падающий тест, минимальный код, улучшение. Не обязателен всегда; особенно полезен для багов и новых бизнес-правил, где ожидаемое поведение известно заранее.
:::

:::spoiler Если для теста нужно настроить восемь моков, что это значит?
У тестируемого класса слишком много зависимостей и, вероятно, слишком много обязанностей. Нужно упрощать дизайн, а не искать более удобный мок-фреймворк.
:::

## Что запомнить

- Двойники: dummy (заглушка места), stub (ответы), spy (записывает), mock (ожидает вызовы), fake (упрощённая рабочая реализация).
- Мокай границы (репозитории, внешние сервисы, часы), домен создавай настоящим.
- Предпочитай проверку результата и состояния; `Received`/`Verify` — только для значимых побочных эффектов.
- Библиотеки моков создают заместителя интерфейса, записывают вызовы и отдают настроенные ответы; ненастроенный метод возвращает значение по умолчанию.
- Много моков в одном тесте — признак слишком большого сервиса.
- TDD: red → green → refactor; убедись, что тест падает по нужной причине; пиши минимум кода под текущий тест.
- Каждый баг и каждое новое правило начинай с падающего теста.
- Fake не заменяет проверку поведения настоящей базы — это дело интеграционных тестов.

## Практика

- [ ] Написал 10+ тестов сервисов Application с NSubstitute (успех, «не найдено», «нет прав», «конфликт»)
- [ ] Сделал Fake-реализацию `IClock` и использовал её вместо мока
- [ ] Реализовал по TDD одно новое правило проекта (например, лимит задач на исполнителя) — коммиты red/green/refactor отдельно
- [ ] Посчитал тесты: вместе с доменными — 40+

@@page id="p5-integration" phase="5" kind="topic" title="Интеграционные тесты API: WebApplicationFactory" nav="Интеграционные тесты" est="~1 неделя"
:::why
Unit-тесты не поймают неправильный маршрут, забытую регистрацию в DI, кривой SQL или неверный порядок middleware. Интеграционный тест поднимает **всё приложение в памяти** и ходит в него по HTTP — как настоящий клиент.
:::

## Зачем это нужно

Представь, что все unit-тесты проекта зелёные, а после развёртывания каждый запрос возвращает `500`. Причина банальна: в `Program.cs` забыли зарегистрировать сервис в DI. Или перепутали порядок `UseAuthentication` и `UseAuthorization`. Или в маршруте опечатка, и `/api/tasks/5` отвечает `404`. Или сериализация возвращает поля в другом регистре, чем ждёт клиент. Unit-тест такого не увидит: он создаёт классы руками, минуя весь «клей» приложения. Именно этот клей и проверяют интеграционные тесты: поднимается приложение целиком, и тест обращается к нему по HTTP — как клиент.

Они медленнее unit-тестов (поднимается хост, при необходимости база), поэтому пишут их меньше и по другим принципам: по одному сценарию «счастливого пути» на ресурс, коды ошибок, места, где важна база данных. Остальные бизнес-правила проверяют unit-тесты — получается «пирамида тестов»: много быстрых внизу, мало медленных вверху.

Что ты получишь от темы:

- поймёшь, что именно проверяет интеграционный тест и чем он отличается от unit-теста;
- научишься подменять зависимости (время, хранилище, внешние сервисы) в тестовом приложении;
- избежишь главной ловушки — общего состояния между тестами;
- поймёшь, почему для проверки работы с базой нужна настоящая СУБД, а не `InMemory`-провайдер EF Core;
- сможешь отвечать на вопросы собеседований: «чем интеграционные тесты отличаются от unit», «что такое `WebApplicationFactory`», «как тестировать код с базой».

О проверке: `Microsoft.AspNetCore.Mvc.Testing`, `Testcontainers` и xUnit — пакеты NuGet, а в нашей учебной среде NuGet недоступен и Docker не запущен. Поэтому код с `WebApplicationFactory` и Testcontainers приведён как образец и не запускался. Но сам принцип проверен: тесты ниже запускаются на **настоящем сервере ASP.NET Core** (Kestrel), собранном из тех же частей, что и боевое приложение, с подменой сервисов — ровно то, что делает `WebApplicationFactory`. А различия между `InMemory`-хранилищем и настоящей СУБД показаны на реальном PostgreSQL 16.

## Интуиция и аналогия

**Проверка деталей на стенде и ходовые испытания.** Unit-тест — проверка каждой детали на стенде: поршень выдерживает давление, тормозной диск не трескается. Интеграционный тест — выезд на трассу: все детали собраны, и мы смотрим, поедет ли машина. Поломка может быть в соединении деталей, а не в самих деталях.

**Генеральная репетиция.** Актёры знают роли (unit-тесты), но только на репетиции со светом, декорациями и звуком видно, что занавес открывается не в тот момент.

**Чистая кухня на каждую смену.** Если в ресторане каждая смена начинается с чистой кухни, результат не зависит от того, что готовила предыдущая. Если грязная посуда остаётся с прошлого раза, блюда зависят от истории. Так и тесты: у каждого должно быть чистое состояние.

**Песочница против настоящей игры.** `InMemory`-провайдер — игрушечная песочница: ничего не ограничивает, ничего не проверяет. Настоящая база — игра по правилам: уникальные индексы, внешние ключи, транзакции. Если тренироваться только в песочнице, на настоящем поле ты ошибёшься.

## Основная теория по шагам

### Шаг 1. Минимальный тест

~~~bash
dotnet new xunit -n TaskBoard.Api.Tests
dotnet add TaskBoard.Api.Tests reference TaskBoard.Api
dotnet add TaskBoard.Api.Tests package Microsoft.AspNetCore.Mvc.Testing
~~~

~~~csharp @nocheck
using System.Net;
using Microsoft.AspNetCore.Mvc.Testing;

public sealed class HealthTests(WebApplicationFactory<Program> factory) : IClassFixture<WebApplicationFactory<Program>>
{
    [Fact]
    public async Task UnknownTask_Returns404ProblemDetails()
    {
        var client = factory.CreateClient();

        var response = await client.GetAsync("/api/tasks/999999");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
    }
}
~~~

`WebApplicationFactory<Program>` запускает твой `Program.cs` на тестовом сервере в памяти (без сети и портов). Если тест «не видит» класс `Program` (он генерируется из top-level statements), добавь в конец `Program.cs` строку `public partial class Program;`.

### Шаг 2. Что делает фабрика — на живом примере

Чтобы увидеть всё это в действии без NuGet, соберём то же самое сами. Файл ниже содержит: «боевое» приложение (метод `AppFactory.Build`, как `Program.cs`), крошечный запускатор тестового сервера (аналог `WebApplicationFactory`) и несколько интеграционных тестов. Приложение — маленький учебный API задач: поиск, создание с валидацией, удаление с авторизацией. Все тесты обращаются к нему по HTTP, как клиент.

~~~csharp
using System.Net;
using System.Net.Http.Headers;
using System.Text.Json;
using Microsoft.AspNetCore.Authentication;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Options;
using System.Text.Encodings.Web;

var fixedNow = new DateTimeOffset(2026, 10, 13, 12, 0, 0, TimeSpan.Zero);

async Task Check(string name, Func<Task> test)
{
    try { await test(); Console.WriteLine($"[ok]   {name}"); }
    catch (Exception e) { Console.WriteLine($"[FAIL] {name}: {e.Message}"); }
}
void True(bool condition, string message) { if (!condition) throw new Exception(message); }
async Task<JsonElement> Json(HttpResponseMessage r) => JsonDocument.Parse(await r.Content.ReadAsStringAsync()).RootElement.Clone();
HttpRequestMessage Authorized(HttpMethod m, string url) { var r = new HttpRequestMessage(m, url); r.Headers.Authorization = new AuthenticationHeaderValue("Bearer", "secret-token"); return r; }
StringContent Body(object o) => new(JsonSerializer.Serialize(o), System.Text.Encoding.UTF8, "application/json");

// ---------- сами тесты ----------
await Check("несуществующая задача → 404 в формате ProblemDetails", async () =>
{
    await using var app = await TestApp.StartAsync();
    var r = await app.Client.GetAsync("/api/tasks/999999");
    True(r.StatusCode == HttpStatusCode.NotFound, $"код {(int)r.StatusCode}");
    True(r.Content.Headers.ContentType?.MediaType == "application/problem+json", "тип содержимого " + r.Content.Headers.ContentType?.MediaType);
});

await Check("создание → 201, Location читается, время из подменённых часов", async () =>
{
    await using var app = await TestApp.StartAsync(s => s.AddSingleton<TimeProvider>(new FixedClock(fixedNow)));   // как ConfigureTestServices
    var create = await app.Client.PostAsync("/api/projects/1/tasks", Body(new { title = "Форма входа" }));
    True(create.StatusCode == HttpStatusCode.Created, $"код {(int)create.StatusCode}");

    var read = await app.Client.GetAsync(create.Headers.Location!.OriginalString);
    True(read.StatusCode == HttpStatusCode.OK, "созданную задачу не удалось прочитать");
    var task = await Json(read);
    True(task.GetProperty("title").GetString() == "Форма входа", "заголовок не совпал");
    True(task.GetProperty("createdAt").GetDateTimeOffset() == fixedNow, "время создания не из подменённых часов");
});

await Check("пустое название → 400 и ошибка в поле title", async () =>
{
    await using var app = await TestApp.StartAsync();
    var r = await app.Client.PostAsync("/api/projects/1/tasks", Body(new { title = "  " }));
    True(r.StatusCode == HttpStatusCode.BadRequest, $"код {(int)r.StatusCode}");
    True((await Json(r)).GetProperty("errors").TryGetProperty("title", out _), "нет ошибки в поле title");
});

await Check("повтор названия в проекте → 409", async () =>
{
    await using var app = await TestApp.StartAsync();
    await app.Client.PostAsync("/api/projects/1/tasks", Body(new { title = "Форма входа" }));
    var again = await app.Client.PostAsync("/api/projects/1/tasks", Body(new { title = "Форма входа" }));
    True(again.StatusCode == HttpStatusCode.Conflict, $"код {(int)again.StatusCode}");
});

await Check("удаление без токена → 401, с токеном → 204, затем 404", async () =>
{
    await using var app = await TestApp.StartAsync(s => s.AddSingleton<ITaskStore>(InMemoryStore.WithSeed(7, "Готовая задача")));
    var anonymous = await app.Client.DeleteAsync("/api/tasks/7");
    True(anonymous.StatusCode == HttpStatusCode.Unauthorized, $"без токена: {(int)anonymous.StatusCode}");

    var deleted = await app.Client.SendAsync(Authorized(HttpMethod.Delete, "/api/tasks/7"));
    True(deleted.StatusCode == HttpStatusCode.NoContent, $"с токеном: {(int)deleted.StatusCode}");

    var gone = await app.Client.GetAsync("/api/tasks/7");
    True(gone.StatusCode == HttpStatusCode.NotFound, "после удаления задача всё ещё читается");
});

// ---------- главная ловушка: общее состояние ----------
Console.WriteLine("--- один общий сервер на два теста (как IClassFixture без очистки) ---");
await using (var shared = await TestApp.StartAsync())
{
    await Check("тест A создаёт задачу", async () =>
    {
        var r = await shared.Client.PostAsync("/api/projects/1/tasks", Body(new { title = "Из теста A" }));
        True(r.StatusCode == HttpStatusCode.Created, "не создалось");
    });
    await Check("тест B ожидает пустое хранилище", async () =>
    {
        int count = shared.Services.GetRequiredService<ITaskStore>().Count;
        True(count == 0, $"хранилище не пусто: в нём {count} шт. от предыдущего теста");
    });
}
Console.WriteLine("--- свой сервер на каждый тест ---");
await Check("тест B на чистом сервере", async () =>
{
    await using var app = await TestApp.StartAsync();
    int count = app.Services.GetRequiredService<ITaskStore>().Count;
    True(count == 0, $"хранилище не пусто: {count}");
});

// ================== «боевое» приложение (аналог Program.cs) ==================
public static class AppFactory
{
    public static WebApplication Build(Action<IServiceCollection>? overrides = null)
    {
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseUrls("http://127.0.0.1:0");
        builder.Logging.ClearProviders();

        builder.Services.AddProblemDetails();
        builder.Services.AddSingleton<ITaskStore, InMemoryStore>();
        builder.Services.AddSingleton(TimeProvider.System);
        builder.Services.AddAuthentication("Bearer").AddScheme<AuthenticationSchemeOptions, TokenHandler>("Bearer", null);
        builder.Services.AddAuthorization();

        overrides?.Invoke(builder.Services);                    // тест регистрирует подмены ПОСЛЕ боевых: побеждает последняя

        var app = builder.Build();
        app.UseStatusCodePages();
        app.UseAuthentication();
        app.UseAuthorization();

        app.MapGet("/api/tasks/{id:int}", (int id, ITaskStore store) =>
            store.Find(id) is { } task ? Results.Ok(task) : Results.Problem(statusCode: 404, title: "Задача не найдена"));

        app.MapPost("/api/projects/{projectId:int}/tasks", (int projectId, CreateTask req, ITaskStore store, TimeProvider clock) =>
        {
            if (string.IsNullOrWhiteSpace(req.Title))
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["title"] = ["Название обязательно"] });
            if (!store.TryAdd(projectId, req.Title.Trim(), clock.GetUtcNow(), out var task))
                return Results.Problem(statusCode: 409, title: "Задача с таким названием уже есть");
            return Results.Created($"/api/tasks/{task.Id}", task);
        });

        app.MapDelete("/api/tasks/{id:int}", (int id, ITaskStore store) => store.Remove(id) ? Results.NoContent() : Results.Problem(statusCode: 404, title: "Задача не найдена"))
           .RequireAuthorization();
        return app;
    }
}

// ================== аналог WebApplicationFactory ==================
public sealed class TestApp : IAsyncDisposable
{
    private readonly WebApplication _app;
    public HttpClient Client { get; }
    public IServiceProvider Services => _app.Services;

    private TestApp(WebApplication app) { _app = app; Client = new HttpClient { BaseAddress = new Uri(app.Urls.First()) }; }

    public static async Task<TestApp> StartAsync(Action<IServiceCollection>? overrides = null)
    {
        var app = AppFactory.Build(overrides);
        await app.StartAsync();
        return new TestApp(app);
    }

    public async ValueTask DisposeAsync() { Client.Dispose(); await _app.StopAsync(); await _app.DisposeAsync(); }
}

// ================== детали приложения ==================
public sealed record CreateTask(string? Title);
public sealed record TaskDto(int Id, int ProjectId, string Title, DateTimeOffset CreatedAt);

public interface ITaskStore
{
    int Count { get; }
    TaskDto? Find(int id);
    bool TryAdd(int projectId, string title, DateTimeOffset now, out TaskDto task);
    bool Remove(int id);
}

public sealed class InMemoryStore : ITaskStore
{
    private readonly object _gate = new();
    private readonly Dictionary<int, TaskDto> _items = new();
    private int _nextId = 1;

    public static InMemoryStore WithSeed(int id, string title)
    {
        var store = new InMemoryStore();
        store._items[id] = new TaskDto(id, 1, title, DateTimeOffset.UnixEpoch);
        return store;
    }

    public int Count { get { lock (_gate) return _items.Count; } }
    public TaskDto? Find(int id) { lock (_gate) return _items.GetValueOrDefault(id); }
    public bool Remove(int id) { lock (_gate) return _items.Remove(id); }
    public bool TryAdd(int projectId, string title, DateTimeOffset now, out TaskDto task)
    {
        lock (_gate)
        {
            task = null!;
            if (_items.Values.Any(t => t.ProjectId == projectId && t.Title == title)) return false;
            task = new TaskDto(_nextId++, projectId, title, now);
            _items[task.Id] = task;
            return true;
        }
    }
}

public sealed class FixedClock(DateTimeOffset now) : TimeProvider { public override DateTimeOffset GetUtcNow() => now; }

public sealed class TokenHandler(IOptionsMonitor<AuthenticationSchemeOptions> options, ILoggerFactory logger, UrlEncoder encoder)
    : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
{
    protected override Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        if (Request.Headers.Authorization.ToString() != "Bearer secret-token") return Task.FromResult(AuthenticateResult.NoResult());
        var identity = new System.Security.Claims.ClaimsIdentity("Bearer");
        return Task.FromResult(AuthenticateResult.Success(new AuthenticationTicket(new System.Security.Claims.ClaimsPrincipal(identity), "Bearer")));
    }
}
~~~
~~~console
[ok]   несуществующая задача → 404 в формате ProblemDetails
[ok]   создание → 201, Location читается, время из подменённых часов
[ok]   пустое название → 400 и ошибка в поле title
[ok]   повтор названия в проекте → 409
[ok]   удаление без токена → 401, с токеном → 204, затем 404
--- один общий сервер на два теста (как IClassFixture без очистки) ---
[ok]   тест A создаёт задачу
[FAIL] тест B ожидает пустое хранилище: хранилище не пусто: в нём 1 шт. от предыдущего теста
--- свой сервер на каждый тест ---
[ok]   тест B на чистом сервере
~~~

Прочитаем результат как отчёт `dotnet test`. Пять тестов зелёные: маршруты, формат ошибок, валидация, конфликт и авторизация работают **вместе**. Время создания в третьем тесте было подменено: в боевом приложении используется `TimeProvider.System`, а тест зарегистрировал свои часы **после** боевых регистраций, и контейнер DI выдал последнюю. Это и есть `ConfigureTestServices` в `WebApplicationFactory`: «зарегистрируй вторую реализацию, победит последняя».

А вот ловушка внизу: тест B упал не потому, что с кодом что-то не так, а потому что общий сервер хранит данные теста A. На CI порядок и параллелизм изменятся, и такие тесты станут «плавающими». Лекарство в том же листинге: свой экземпляр приложения (или свои данные) на каждый тест.

### Шаг 3. Настоящая база: Testcontainers

In-memory провайдер EF Core ведёт себя не как PostgreSQL (нет транзакций, ограничений, того же SQL). Надёжнее поднять настоящий PostgreSQL в Docker на время тестов.

~~~bash
dotnet add TaskBoard.Api.Tests package Testcontainers.PostgreSql
~~~

~~~csharp ApiFactory.cs (пример для xUnit v2) @nocheck
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Testcontainers.PostgreSql;

public sealed class ApiFactory : WebApplicationFactory<Program>, IAsyncLifetime
{
    private readonly PostgreSqlContainer _db = new PostgreSqlBuilder().WithImage("postgres:16").Build();

    public async Task InitializeAsync()
    {
        await _db.StartAsync();
        using var scope = Services.CreateScope();
        await scope.ServiceProvider.GetRequiredService<AppDbContext>().Database.MigrateAsync();
    }

    Task IAsyncLifetime.DisposeAsync() => _db.DisposeAsync().AsTask();

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");
        builder.ConfigureTestServices(services =>
        {
            // заменить регистрацию DbContext из Program.cs на тестовую базу
            services.RemoveAll<DbContextOptions<AppDbContext>>();
            services.AddDbContext<AppDbContext>(o => o.UseNpgsql(_db.GetConnectionString()));
        });
    }
}
~~~

:::info Версии библиотек
Детали замены `DbContext` различаются между версиями EF Core (в новых версиях дополнительно регистрируется конфигурация опций), а у xUnit v3 изменился интерфейс `IAsyncLifetime`. Если что-то не сходится — открой статью Microsoft Learn про интеграционные тесты для своей версии .NET: там актуальный код.
:::

Зачем вообще настоящая база, если логику хранения можно подменить словарём (как мы только что сделали)? Потому что часть правил живёт **в самой базе**: уникальные индексы, внешние ключи, проверочные ограничения, транзакции. Словарь и `InMemory`-провайдер их не знают, и тесты проходят там, где реальный код упадёт. Покажем на PostgreSQL 16 (учебная схема библиотеки с теми же видами ограничений, что и в вашей модели). Дубликат уникального ключа:

~~~sql Уникальный индекс
INSERT INTO "Readers" ("FullName", "CardNumber", "Type") VALUES ('Дубль', 'R-001', 'Student');
~~~
~~~console
ERROR:  duplicate key value violates unique constraint "IX_Readers_CardNumber"
DETAIL:  Key ("CardNumber")=(R-001) already exists.
~~~

Внешний ключ — нельзя создать выдачу для несуществующей книги:

~~~sql Внешний ключ
INSERT INTO "Loans" ("BookId", "ReaderId", "LoanedAt", "DueAt") VALUES (999, 1, '2026-10-01', '2026-10-15');
~~~
~~~console
ERROR:  insert or update on table "Loans" violates foreign key constraint "FK_Loans_Books_BookId"
DETAIL:  Key (BookId)=(999) is not present in table "Books".
~~~

Проверочное ограничение — число экземпляров не может быть отрицательным:

~~~sql Проверочное ограничение
UPDATE "Books" SET "Copies" = -1 WHERE "Id" = 1;
~~~
~~~console
ERROR:  new row for relation "Books" violates check constraint "CK_Books_Copies"
DETAIL:  Failing row contains (1, 978-5-01, Мастер и Маргарита, Роман, 1967, -1).
~~~

И `RESTRICT` — нельзя удалить читателя, у которого есть выдачи:

~~~sql Запрет каскада
DELETE FROM "Readers" WHERE "Id" = 1;
~~~
~~~console
ERROR:  update or delete on table "Readers" violates foreign key constraint "FK_Loans_Readers_ReaderId" on table "Loans"
DETAIL:  Key (Id)=(1) is still referenced from table "Loans".
~~~

Ни одно из этих ограничений база данных в `InMemory`-провайдере не применяет (он не реляционный): уникальные индексы, внешние ключи и проверочные ограничения там просто отсутствуют, а часть правил удаления работает лишь на уровне трекера изменений EF. Интеграционный тест с настоящей СУБД поймает расхождение между вашей моделью и реальными правилами базы. Для этого и существует Testcontainers: библиотека через Docker поднимает контейнер с настоящим PostgreSQL на случайном порту на время тестов и уничтожает его после.

### Шаг 4. Изоляция данных между тестами при настоящей базе

С базой проблема из шага 2 (общее состояние) острее: данные остаются в таблицах. Способы изолировать тесты:

- **База (или схема) на тестовый класс или набор тестов** + уникальные данные в каждом тесте (например, новый пользователь с уникальным email).
- **Очистка между тестами** (специальные библиотеки вроде Respawn удаляют данные из всех таблиц, кроме служебных).
- **Транзакция на тест с откатом** — самый быстрый вариант, если приложение использует одно соединение.

Последнее проверим на базе — вставка внутри транзакции исчезает после отката:

~~~sql Откат транзакции как очистка
BEGIN;
INSERT INTO "Readers" ("FullName", "CardNumber", "Type") VALUES ('Тестовый читатель', 'T-001', 'Student');
SELECT count(*) AS "читателей внутри теста" FROM "Readers";
ROLLBACK;
SELECT count(*) AS "читателей после отката" FROM "Readers";
~~~
~~~console
 читателей внутри теста 
------------------------
                      5
(1 row)

 читателей после отката 
------------------------
                      4
(1 row)
~~~

### Шаг 5. Сценарные тесты

Самый ценный интеграционный тест — сквозной сценарий: регистрация → вход → создание → чтение.

~~~csharp Сценарный тест: регистрация → логин → создание задачи @nocheck
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;

public sealed class TaskFlowTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    [Fact]
    public async Task CreateTask_AsProjectMember_Returns201AndTaskIsReadable()
    {
        var client = factory.CreateClient();
        var token = await RegisterAndLoginAsync(client, "anna@example.com");
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

        var project = await (await client.PostAsJsonAsync("/api/projects", new { name = "Сайт" }))
            .Content.ReadFromJsonAsync<IdResponse>();
        var create = await client.PostAsJsonAsync($"/api/projects/{project!.Id}/tasks", new { title = "Форма входа", tags = Array.Empty<string>() });

        Assert.Equal(HttpStatusCode.Created, create.StatusCode);
        var read = await client.GetAsync(create.Headers.Location);
        Assert.Equal(HttpStatusCode.OK, read.StatusCode);
    }

    private static async Task<string> RegisterAndLoginAsync(HttpClient client, string email)
    {
        await client.PostAsJsonAsync("/api/auth/register", new { email, password = "S3cret-pass!", displayName = "Анна" });
        var login = await client.PostAsJsonAsync("/api/auth/login", new { email, password = "S3cret-pass!" });
        return (await login.Content.ReadFromJsonAsync<TokenResponse>())!.AccessToken;
    }

    private sealed record IdResponse(int Id);
    private sealed record TokenResponse(string AccessToken);
}
~~~

### Шаг 6. Что покрывать интеграционными тестами

- Основные сценарии «счастливого пути» (по одному на ресурс).
- Коды ошибок: 400 (валидация), 401/403 (доступ), 404, 409.
- Места, где важна база: уникальность, транзакции, сложные запросы.
- Не дублируй каждое бизнес-правило — они уже покрыты unit-тестами. Пирамида: много unit, меньше интеграционных.

## Как это работает под капотом

- **Что делает `WebApplicationFactory<Program>`.** Находит точку входа твоего приложения (`Program`), запускает её с подменённым хостом и вместо Kestrel подключает тестовый сервер `TestServer`, работающий **в памяти**: запросы идут как вызовы методов, без сети и портов. `CreateClient()` возвращает обычный `HttpClient`, направленный на этот сервер. В нашем примере вместо `TestServer` используется настоящий Kestrel на свободном порту `127.0.0.1` — принцип тот же, цена чуть выше.
- **Откуда берётся класс `Program`.** При top-level statements компилятор генерирует внутренний класс `Program`, который тестовый проект не видит. Строка `public partial class Program;` делает его доступным.
- **Подмена сервисов.** Регистрации в `ConfigureTestServices` выполняются после боевых, а контейнер DI при запросе одного интерфейса возвращает **последнюю** регистрацию. Поэтому достаточно добавить свою; чтобы убрать старую, используют `RemoveAll<T>()`. Именно это мы сделали с часами и хранилищем.
- **Окружение и конфигурация.** Тестовый хост по умолчанию работает в окружении `Development`, если не указано другое (`UseEnvironment("Testing")`). Конфигурацию тестов (строка подключения, ключи) подмешивают через `ConfigureAppConfiguration` или переменные окружения.
- **Жизненный цикл фикстуры.** `IClassFixture<T>` создаёт один экземпляр фабрики на тестовый класс: хост и контейнер БД стартуют один раз, тесты класса делят их. Это быстро и поэтому опасно общим состоянием — вернёмся к ловушке из шага 2.
- **Testcontainers.** Через Docker API запускает контейнер из образа, ждёт готовности (проверка порта или журнала), пробрасывает случайный порт на хост и отдаёт строку подключения. Специальный вспомогательный контейнер удаляет созданные контейнеры даже при аварийном завершении тестов. Требует работающего Docker, поэтому на CI он должен быть доступен.
- **Параллельность.** xUnit запускает разные тестовые классы параллельно. Если все классы работают с одной базой, тесты начнут мешать друг другу; лечат отдельными базами/схемами, уникальными данными или отключением параллелизма для таких классов.
- **Скорость.** Миграции и поднятие контейнера выполняют один раз на набор тестов, а не на тест; именно поэтому в фикстуре. Каждый тест после этого лишь выполняет запросы к уже готовой базе.
- **Что НЕ нужно проверять интеграционными тестами.** Каждый ветвящийся случай бизнес-правил: их быстрее и точнее покрывают unit-тесты.

## Типичные ошибки и ловушки

- **Общее состояние между тестами** (общая база/хранилище без очистки). Тесты зависят от порядка и параллелизма.
- **`InMemory`-провайдер EF Core вместо настоящей СУБД.** Нет ограничений, транзакций и SQL-поведения; тесты зелёные, продакшен падает.
- **Тест дублирует все бизнес-правила.** Медленный набор тестов, который никто не хочет запускать.
- **Реальные внешние сервисы в тестах** (SMTP, платёжный шлюз). Нестабильность и побочные эффекты; подменяй их в `ConfigureTestServices`.
- **Не подменили время и случайность.** Тесты, зависящие от `DateTime.UtcNow`, нестабильны.
- **Тест без чистого старта:** миграции не применены или применены не к той базе.
- **Сложная логика в тесте** (циклы, ветвления). Тест нужно читать, а не отлаживать.
- **Игнорирование Docker на CI.** Локально всё зелёное, а в конвейере контейнеры не поднимаются.
- **Слишком много сквозных тестов.** Медленно и хрупко; пирамида нарушена.
- **Не проверять формат ошибок** (`problem+json`, коды): контракт API ломается незаметно.
- **Тестовые данные, влияющие друг на друга** (один и тот же email у разных тестов): используй уникальные значения.
- **Не освобождать ресурсы** (клиенты, фабрика, контейнеры): утечки и зависшие порты.

## Вопросы с собеседований

:::spoiler Что ловят интеграционные тесты, чего не ловят unit-тесты?
Ошибки сборки приложения целиком: регистрацию DI, маршруты, порядок middleware, сериализацию, авторизацию, реальные SQL-запросы и ограничения базы.
:::

:::spoiler Почему не EF Core InMemory для интеграционных тестов?
Он не реляционный: нет транзакций, внешних ключей, уникальных индексов, того же поведения запросов. Тесты проходят там, где на PostgreSQL код упадёт.
:::

:::spoiler Что такое WebApplicationFactory и как подменить в нём сервис?
Класс, который запускает приложение (`Program`) на тестовом сервере в памяти и выдаёт `HttpClient`. Подмена — в `ConfigureTestServices`: регистрации выполняются после боевых, побеждает последняя; старую удаляют `RemoveAll<T>()`.
:::

:::spoiler Чем интеграционный тест отличается от unit-теста?
Unit-тест проверяет один класс изолированно с двойниками вместо зависимостей. Интеграционный поднимает приложение целиком (и при необходимости реальную базу) и проверяет, что части работают вместе.
:::

:::spoiler Как изолировать данные между интеграционными тестами? (ловушка: «общая база достаточно удобна»)
Отдельная база/схема на класс, уникальные данные в каждом тесте, очистка между тестами (например, Respawn) или откат транзакции. Общая база без очистки приводит к зависимости от порядка и параллелизма.
:::

:::spoiler Зачем Testcontainers, если есть InMemory?
Он поднимает настоящую СУБД в Docker на время тестов. Так проверяются реальные ограничения, транзакции и SQL, которых нет у InMemory.
:::

:::spoiler Сколько интеграционных тестов нужно писать? (ловушка: «на каждое правило»)
Меньше, чем unit-тестов: по сценарию на ресурс, основные коды ошибок и места, где важна база. Бизнес-правила проверяют unit-тесты — иначе набор тестов становится медленным и хрупким.
:::

:::spoiler Почему тесты на CI могут падать, а локально проходить?
Другой порядок и параллелизм, общее состояние, зависимость от окружения (время, часовой пояс, Docker, порты, переменные окружения), неприменённые миграции.
:::

## Что запомнить

- Интеграционный тест поднимает приложение целиком и обращается к нему по HTTP — ловит то, что не видят unit-тесты (DI, маршруты, middleware, сериализацию, авторизацию, SQL).
- `WebApplicationFactory<Program>` запускает `Program` на тестовом сервере в памяти; `public partial class Program;` делает класс видимым.
- Подмена зависимостей — `ConfigureTestServices`: побеждает последняя регистрация; время и внешние сервисы подменяй всегда.
- Главная ловушка — общее состояние между тестами: свой сервер/данные на тест или очистка между тестами.
- Для проверки работы с базой нужна настоящая СУБД (Testcontainers + PostgreSQL), а не InMemory: уникальные индексы, внешние ключи, ограничения и транзакции в нём не работают.
- Пирамида: много unit-тестов, меньше интеграционных; интеграционные — сценарии «счастливого пути», коды ошибок, места с базой.
- `dotnet test` должен проходить одной командой (при запущенном Docker), в том числе на CI.

## Практика

- [ ] Поднял `WebApplicationFactory` и написал первый тест на 404
- [ ] Подключил Testcontainers с PostgreSQL и применил миграции перед тестами
- [ ] Написал 5–8 интеграционных тестов: сценарий, валидация, 401/403, конфликт уникальности
- [ ] `dotnet test` проходит локально одной командой (при запущенном Docker)

@@page id="p5-patterns" phase="5" kind="topic" title="Паттерны для backend: Strategy, Factory, Decorator, Mediator" nav="Паттерны" est="~1 неделя"
:::why
Критерий фазы: **один паттерн, применённый не потому, что модно, а с объяснением, какую проблему он решил**. Поэтому каждый паттерн здесь начинается с боли, а не с UML-диаграммы.
:::

## Зачем это нужно

Паттерн проектирования — это не «красивая схема из книги», а **имя для решения, которое многократно помогало в типичной ситуации**. Когда один разработчик говорит другому «давай сделаем декоратор над репозиторием», он в одном слове передаёт: класс с тем же интерфейсом, который оборачивает настоящий объект и добавляет поведение, не меняя его. Так паттерны ускоряют общение и подсказывают проверенные решения.

У паттернов есть и тёмная сторона: новичок, только что узнавший о них, начинает применять их везде. Появляются фабрики фабрик, стратегии с единственной реализацией, медиаторы на три класса. Код становится запутанным без пользы. Поэтому критерий фазы сформулирован так: паттерн нужен **по реальной причине** — ты можешь назвать боль (дублирование, разрастающийся `switch`, смешение обязанностей), которую он убрал.

Что ты получишь от темы:

- научишься начинать с проблемы, а не с названия паттерна;
- поймёшь четыре практичных для backend паттерна: Strategy, Factory, Decorator и идею Mediator/CQRS;
- увидишь, как они сочетаются с внедрением зависимостей ASP.NET Core ([DI](#p4-di)), включая ключевые сервисы;
- сможешь описать применение паттерна в README так, как просит критерий;
- сможешь отвечать на вопросы собеседований: «чем Strategy отличается от Decorator», «что такое фабрика и нужна ли она при DI», «что такое CQRS», «когда паттерн вреден».

Все примеры ниже **запускаются**: стратегии и декораторы — обычные классы, фабрика — на настоящем DI-контейнере и сервере ASP.NET Core, а медиатор мы пишем сами (около тридцати строк), чтобы увидеть, как устроен конвейер поведений. Готовые библиотеки (MediatR, Scrutor) ставятся из NuGet, а в нашей учебной среде он недоступен, поэтому на них мы лишь ссылаемся.

## Интуиция и аналогия

**Strategy — режимы навигатора.** Один и тот же маршрут «из А в Б» можно построить как «самый быстрый», «без платных дорог» или «самый живописный». Навигатор (клиентский код) один и тот же, а алгоритм (стратегия) выбирается и подменяется. Добавить режим «для велосипеда» — не значит переписывать навигатор.

**Factory — касса, которая выдаёт нужный билет.** Вы говорите «детский на утренний сеанс», кассир (фабрика) знает, какой билет выдать, а вы не знаете, как их печатают. Знание «как создать нужный объект» собрано в одном месте.

**Decorator — стаканчик кофе с добавками.** Эспрессо остаётся эспрессо, но сверху добавляют молоко, потом сироп, потом крышку. Каждая добавка «оборачивает» предыдущую и не требует переделывать кофемашину. Порядок слоёв имеет значение: крышка идёт последней.

**Mediator и CQRS — диспетчер и отдельные окна.** Вместо одного «универсального» окошка, где работает всё отделение и которое знает про все услуги, есть диспетчер, направляющий клиента в нужное окно: окно для заявлений (команды меняют состояние) и окно справок (запросы только читают). У каждого окна свой маленький набор инструментов.

## Основная теория по шагам

### Шаг 1. Strategy — разные алгоритмы за одним интерфейсом

**Боль:** расчёт приоритета задачи различается по типу проекта, и метод превратился в `switch` на 80 строк, который правят все.

~~~csharp @nocheck
public interface IPriorityStrategy
{
    int Calculate(TaskInfo task);
}

public sealed class DeadlinePriority : IPriorityStrategy
{
    public int Calculate(TaskInfo t) => t.DaysToDeadline switch { <= 0 => 100, <= 2 => 80, <= 7 => 50, _ => 10 };
}

public sealed class BugFirstPriority : IPriorityStrategy
{
    public int Calculate(TaskInfo t) => (t.IsBug ? 60 : 0) + Math.Max(0, 40 - t.DaysToDeadline);
}

public sealed record TaskInfo(int DaysToDeadline, bool IsBug);
~~~

Каждый алгоритм — отдельный класс, тестируется отдельно; новый алгоритм не трогает существующие. Ты уже применял это в Фазе 2 (`IFineRule`). Запустим и увидим, как одни и те же задачи получают разные приоритеты, как выбирается стратегия по типу проекта и как контейнер DI хранит несколько реализаций:

~~~csharp
using Microsoft.Extensions.DependencyInjection;

var tasks = new[] { new TaskInfo(-1, false), new TaskInfo(2, true), new TaskInfo(10, false), new TaskInfo(10, true) };

IPriorityStrategy[] all = [new DeadlinePriority(), new BugFirstPriority()];
foreach (var s in all)
    Console.WriteLine($"{s.Name,-9}: приоритеты задач → {string.Join(", ", tasks.Select(s.Calculate))}");

// стратегию выбирает проект, а метод сортировки не знает, какая она
IEnumerable<TaskInfo> Sort(IEnumerable<TaskInfo> items, IPriorityStrategy s) => items.OrderByDescending(s.Calculate);
Console.WriteLine("Порядок для проекта поддержки (bugfirst): " + string.Join(" > ", Sort(tasks, all[1]).Select(Describe)));
Console.WriteLine("Порядок для проекта с дедлайнами:         " + string.Join(" > ", Sort(tasks, all[0]).Select(Describe)));

// новая стратегия — новый класс (или даже лямбда), существующие классы не меняются
IPriorityStrategy bugsOnly = new DelegatePriority("bugs-only", t => t.IsBug ? 1 : 0);
Console.WriteLine($"{bugsOnly.Name,-9}: приоритеты задач → {string.Join(", ", tasks.Select(bugsOnly.Calculate))}");

// в DI несколько реализаций одного интерфейса получаются списком
var services = new ServiceCollection();
services.AddSingleton<IPriorityStrategy, DeadlinePriority>();
services.AddSingleton<IPriorityStrategy, BugFirstPriority>();
using var provider = services.BuildServiceProvider();
var byName = provider.GetServices<IPriorityStrategy>().ToDictionary(s => s.Name);
Console.WriteLine($"Из контейнера по имени: {string.Join(", ", byName.Keys)}");

static string Describe(TaskInfo t) => $"[{(t.IsBug ? "баг" : "задача")}, {t.DaysToDeadline} дн.]";

public interface IPriorityStrategy
{
    string Name { get; }
    int Calculate(TaskInfo task);
}
public sealed class DeadlinePriority : IPriorityStrategy
{
    public string Name => "deadline";
    public int Calculate(TaskInfo t) => t.DaysToDeadline switch { <= 0 => 100, <= 2 => 80, <= 7 => 50, _ => 10 };
}
public sealed class BugFirstPriority : IPriorityStrategy
{
    public string Name => "bugfirst";
    public int Calculate(TaskInfo t) => (t.IsBug ? 60 : 0) + Math.Max(0, 40 - t.DaysToDeadline);
}
public sealed class DelegatePriority(string name, Func<TaskInfo, int> calculate) : IPriorityStrategy
{
    public string Name => name;
    public int Calculate(TaskInfo t) => calculate(t);
}
public sealed record TaskInfo(int DaysToDeadline, bool IsBug);
~~~
~~~console
deadline : приоритеты задач → 100, 80, 10, 10
bugfirst : приоритеты задач → 41, 98, 30, 90
Порядок для проекта поддержки (bugfirst): [баг, 2 дн.] > [баг, 10 дн.] > [задача, -1 дн.] > [задача, 10 дн.]
Порядок для проекта с дедлайнами:         [задача, -1 дн.] > [баг, 2 дн.] > [задача, 10 дн.] > [баг, 10 дн.]
bugs-only: приоритеты задач → 0, 1, 0, 1
Из контейнера по имени: deadline, bugfirst
~~~

Одно и то же множество задач упорядочено по-разному, а код сортировки не изменился. Это и есть выигрыш: ветвление `if/switch` по типу превратилось в **выбор объекта**. Если стратегия одна и менять её никто не собирается, паттерн избыточен.

### Шаг 2. Factory — выбор реализации в одном месте

**Боль:** по настройке пользователя нужно отправить уведомление по email, в Telegram или никак, и `if (channel == ...)` расползается по сервисам.

В .NET 8+ в контейнер DI встроены **ключевые сервисы** (keyed services): реализацию регистрируют вместе с ключом и запрашивают по ключу. Это готовая фабрика. Запустим на настоящем сервере:

~~~csharp
var builder = WebApplication.CreateBuilder();
builder.WebHost.UseUrls("http://127.0.0.1:0");
builder.Logging.ClearProviders();
builder.Services.AddKeyedSingleton<INotifier, EmailNotifier>("email");
builder.Services.AddKeyedSingleton<INotifier, TelegramNotifier>("telegram");
builder.Services.AddSingleton<NotifierFactory>();
var app = builder.Build();

app.MapPost("/notify/{channel}", async (string channel, NotifierFactory factory) =>
{
    try { return Results.Ok(await factory.Get(channel).SendAsync("Задача назначена")); }
    catch (DomainException e) { return Results.Problem(e.Message, statusCode: 422); }
});
app.MapPost("/notify-email", async ([FromKeyedServices("email")] INotifier notifier) =>
    Results.Ok(await notifier.SendAsync("запрошен конкретный ключ параметром")));

await app.StartAsync();
using var http = new HttpClient { BaseAddress = new Uri(app.Urls.First()) };
foreach (var url in new[] { "/notify/email", "/notify/telegram", "/notify/sms", "/notify-email" })
{
    var r = await http.PostAsync(url, null);
    var text = await r.Content.ReadAsStringAsync();
    Console.WriteLine($"POST {url,-17} → {(int)r.StatusCode} {(r.IsSuccessStatusCode ? text : "(" + System.Text.Json.JsonDocument.Parse(text).RootElement.GetProperty("title").GetString() + ")")}");
}

// два способа спросить у контейнера по ключу
Console.WriteLine($"GetKeyedService(\"sms\") → {(app.Services.GetKeyedService<INotifier>("sms") is null ? "null" : "объект")}");
try { app.Services.GetRequiredKeyedService<INotifier>("sms"); }
catch (InvalidOperationException e) { Console.WriteLine($"GetRequiredKeyedService(\"sms\") → {e.GetType().Name}"); }
await app.StopAsync();

public interface INotifier { Task<string> SendAsync(string text); }
public sealed class EmailNotifier : INotifier { public Task<string> SendAsync(string text) => Task.FromResult($"email: {text}"); }
public sealed class TelegramNotifier : INotifier { public Task<string> SendAsync(string text) => Task.FromResult($"telegram: {text}"); }

public sealed class NotifierFactory(IServiceProvider services)
{
    public INotifier Get(string channel) =>
        services.GetKeyedService<INotifier>(channel)
        ?? throw new DomainException($"Неизвестный канал уведомлений: {channel}");
}

public class DomainException(string message) : Exception(message);
~~~
~~~console
POST /notify/email     → 200 "email: Задача назначена"
POST /notify/telegram  → 200 "telegram: Задача назначена"
POST /notify/sms       → 422 (Unprocessable Entity)
POST /notify-email     → 200 "email: запрошен конкретный ключ параметром"
GetKeyedService("sms") → null
GetRequiredKeyedService("sms") → InvalidOperationException
~~~

Фабрика собрала в одном месте две вещи: «какой класс за каким ключом» (регистрация) и «что делать с неизвестным ключом» (`DomainException` → `422`). Остальной код ничего не знает про `if (channel == …)`. Заметь различие между `GetKeyedService` (вернёт `null`) и `GetRequiredKeyedService` (бросит исключение): фабрика сама решает, какую семантику выбрать.

Простой фабричный метод (`static INotifier Create(string channel) => channel switch { … }`) тоже фабрика. Не усложняй: если реализаций две и создаются они одной строкой, `switch` в одном месте лучше, чем целая иерархия.

### Шаг 3. Decorator — добавить поведение, не меняя класс

**Боль:** статистика проекта считается тяжёлым запросом, её дёргают на каждой странице. Нужен кэш, но смешивать кэширование с логикой запроса не хочется.

~~~csharp @nocheck
public interface IProjectStats
{
    Task<StatsDto> GetAsync(int projectId, CancellationToken ct);
}

public sealed record StatsDto(int Todo, int InProgress, int Done, int Overdue);

public sealed class CachedProjectStats(IProjectStats inner, IMemoryCache cache) : IProjectStats
{
    public async Task<StatsDto> GetAsync(int projectId, CancellationToken ct) =>
        (await cache.GetOrCreateAsync($"stats:{projectId}", entry =>
        {
            entry.AbsoluteExpirationRelativeToNow = TimeSpan.FromSeconds(30);
            return inner.GetAsync(projectId, ct);           // настоящий расчёт — во «внутреннем» объекте
        }))!;
}

// Регистрация вручную:
// builder.Services.AddMemoryCache();
// builder.Services.AddScoped<DbProjectStats>();
// builder.Services.AddScoped<IProjectStats>(sp =>
//     new CachedProjectStats(sp.GetRequiredService<DbProjectStats>(), sp.GetRequiredService<IMemoryCache>()));
~~~

Декоратор реализует тот же интерфейс и оборачивает «настоящий» объект. Так же добавляют логирование, ретраи, замер времени. Пространство имён `IMemoryCache` — `Microsoft.Extensions.Caching.Memory`. Проверим вживую: сколько раз сработает «настоящий» расчёт, что происходит после истечения срока кэша, как тестируется декоратор с поддельным внутренним объектом и как порядок слоёв меняет поведение.

~~~csharp
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.DependencyInjection;

// ---------- 1. Кэш через DI ----------
var services = new ServiceCollection();
services.AddMemoryCache();
services.AddSingleton<DbProjectStats>();
services.AddSingleton<IProjectStats>(sp =>
    new CachedProjectStats(sp.GetRequiredService<DbProjectStats>(), sp.GetRequiredService<IMemoryCache>(), TimeSpan.FromMilliseconds(200)));
using var provider = services.BuildServiceProvider();

var stats = provider.GetRequiredService<IProjectStats>();
var db = provider.GetRequiredService<DbProjectStats>();
for (int i = 0; i < 3; i++) await stats.GetAsync(1, CancellationToken.None);
Console.WriteLine($"3 запроса подряд → настоящий расчёт выполнен раз: {db.Calls}");

await Task.Delay(300);                                          // срок кэша (200 мс) истёк
await stats.GetAsync(1, CancellationToken.None);
Console.WriteLine($"Запрос после истечения срока → настоящих расчётов: {db.Calls}");
await stats.GetAsync(2, CancellationToken.None);
Console.WriteLine($"Другой проект (другой ключ кэша) → настоящих расчётов: {db.Calls}");

// ---------- 2. Тест декоратора: внутренний объект поддельный, базы нет ----------
var fake = new FakeStats(new StatsDto(1, 2, 3, 0));
var cached = new CachedProjectStats(fake, new MemoryCache(new MemoryCacheOptions()), TimeSpan.FromMinutes(1));
var first = await cached.GetAsync(1, CancellationToken.None);
var second = await cached.GetAsync(1, CancellationToken.None);
Console.WriteLine($"Тест декоратора: результат передан без изменений: {first == fake.Result}, второй вызов взят из кэша: {fake.Calls == 1}");

// ---------- 3. Порядок слоёв имеет значение ----------
var logOuter = new List<string>();
var loggingOutside = new LoggingStats(new CachedProjectStats(new FakeStats(new StatsDto(0, 0, 0, 0)), new MemoryCache(new MemoryCacheOptions()), TimeSpan.FromMinutes(1)), logOuter);
for (int i = 0; i < 3; i++) await loggingOutside.GetAsync(1, CancellationToken.None);

var logInner = new List<string>();
var loggingInside = new CachedProjectStats(new LoggingStats(new FakeStats(new StatsDto(0, 0, 0, 0)), logInner), new MemoryCache(new MemoryCacheOptions()), TimeSpan.FromMinutes(1));
for (int i = 0; i < 3; i++) await loggingInside.GetAsync(1, CancellationToken.None);

Console.WriteLine($"Логирование снаружи кэша: записей в журнале {logOuter.Count} (видны все обращения)");
Console.WriteLine($"Логирование внутри кэша:  записей в журнале {logInner.Count} (видны только настоящие расчёты)");

// ====== интерфейс и реализации ======
public sealed record StatsDto(int Todo, int InProgress, int Done, int Overdue);
public interface IProjectStats { Task<StatsDto> GetAsync(int projectId, CancellationToken ct); }

public sealed class DbProjectStats : IProjectStats
{
    private int _calls;
    public int Calls => _calls;
    public async Task<StatsDto> GetAsync(int projectId, CancellationToken ct)
    {
        Interlocked.Increment(ref _calls);
        await Task.Delay(20, ct);                               // «тяжёлый запрос»
        return new StatsDto(1, 2, 3, 0);
    }
}

public sealed class FakeStats(StatsDto result) : IProjectStats
{
    public StatsDto Result => result;
    public int Calls { get; private set; }
    public Task<StatsDto> GetAsync(int projectId, CancellationToken ct) { Calls++; return Task.FromResult(result); }
}

// ====== декораторы ======
public sealed class CachedProjectStats(IProjectStats inner, IMemoryCache cache, TimeSpan ttl) : IProjectStats
{
    public async Task<StatsDto> GetAsync(int projectId, CancellationToken ct) =>
        (await cache.GetOrCreateAsync($"stats:{projectId}", entry =>
        {
            entry.AbsoluteExpirationRelativeToNow = ttl;
            return inner.GetAsync(projectId, ct);
        }))!;
}

public sealed class LoggingStats(IProjectStats inner, List<string> log) : IProjectStats
{
    public async Task<StatsDto> GetAsync(int projectId, CancellationToken ct)
    {
        log.Add($"статистика проекта {projectId}");
        return await inner.GetAsync(projectId, ct);
    }
}
~~~
~~~console
3 запроса подряд → настоящий расчёт выполнен раз: 1
Запрос после истечения срока → настоящих расчётов: 2
Другой проект (другой ключ кэша) → настоящих расчётов: 3
Тест декоратора: результат передан без изменений: True, второй вызов взят из кэша: True
Логирование снаружи кэша: записей в журнале 3 (видны все обращения)
Логирование внутри кэша:  записей в журнале 1 (видны только настоящие расчёты)
~~~

Три наблюдения. Кэш не знает, как считается статистика, а расчёт не знает про кэш: каждый класс тестируется отдельно (мы проверили декоратор без базы). Срок жизни — часть декоратора, и одна замена регистрации в DI включает или отключает кэш. И порядок слоёв определяет поведение: `Logging(Cached(Db))` пишет каждое обращение, `Cached(Logging(Db))` — только настоящие расчёты. Встроенный контейнер .NET не умеет «декорировать» регистрацию одной строкой, поэтому декораторы собирают вручную фабричной лямбдой, как выше, либо библиотекой Scrutor (`services.Decorate<IProjectStats, CachedProjectStats>()`, пакет из NuGet).

### Шаг 4. Mediator и идея CQRS — разделить команды и запросы

**Боль:** `TaskService` вырос до 40 методов и 12 зависимостей; любой метод тянет все зависимости.

Идея CQRS в лёгком варианте: каждое действие — отдельный маленький класс-обработчик.

- **Команды** меняют состояние (`CompleteTaskCommand`) и ничего не возвращают (или id).
- **Запросы** только читают (`GetProjectStatsQuery`) и могут идти мимо доменной модели прямо в проекцию.

~~~csharp @nocheck
public sealed record CompleteTaskCommand(int TaskId);

public sealed class CompleteTaskHandler(ITaskRepository tasks, IClock clock)
{
    public async Task HandleAsync(CompleteTaskCommand cmd, CancellationToken ct)
    {
        var task = await tasks.FindAsync(cmd.TaskId, ct) ?? throw new NotFoundException($"Задача {cmd.TaskId} не найдена");
        task.Complete(clock.UtcNow);
        await tasks.SaveChangesAsync(ct);
    }
}

// эндпоинт: app.MapPost("/api/tasks/{id:int}/complete", (int id, CompleteTaskHandler h, CancellationToken ct) => h.HandleAsync(new(id), ct));
~~~

**Медиатор** добавляет единую точку `Send(request)` и **конвейер поведений** (логирование, валидация, транзакции для всех обработчиков). Чтобы понять, как это устроено, напишем свой крошечный медиатор на DI и посмотрим конвейер в работе:

~~~csharp
using Microsoft.Extensions.DependencyInjection;

var log = new List<string>();
var services = new ServiceCollection();
services.AddSingleton(log);
services.AddSingleton<ReadModel>();
services.AddSingleton<Mediator>();
services.AddTransient<IHandler<CompleteTask, Unit>, CompleteTaskHandler>();
services.AddTransient<IHandler<GetProjectStats, StatsDto>, GetProjectStatsHandler>();
services.AddTransient<IValidator<CompleteTask>, CompleteTaskValidator>();
services.AddTransient(typeof(IBehavior<,>), typeof(LoggingBehavior<,>));         // порядок регистрации = порядок вложенности:
services.AddTransient(typeof(IBehavior<,>), typeof(ValidationBehavior<,>));      // логирование снаружи, валидация внутри
using var provider = services.BuildServiceProvider();
var mediator = provider.GetRequiredService<Mediator>();

async Task Run(string title, Func<Task> action)
{
    log.Clear();
    try { await action(); } catch (Exception e) { log.Add($"исключение наружу: {e.GetType().Name}"); }
    Console.WriteLine($"--- {title}\n    " + string.Join("\n    ", log));
}

await Run("команда с верными данными", () => mediator.SendAsync<CompleteTask, Unit>(new CompleteTask(7)));
await Run("команда с неверными данными", () => mediator.SendAsync<CompleteTask, Unit>(new CompleteTask(0)));
await Run("запрос (читает проекцию напрямую)", async () =>
{
    var stats = await mediator.SendAsync<GetProjectStats, StatsDto>(new GetProjectStats(5));
    log.Add($"получено: выполнено {stats.Done}, просрочено {stats.Overdue}");
});

// ====== запросы, обработчики ======
public readonly record struct Unit;
public interface IRequest<TResult>;
public sealed record CompleteTask(int TaskId) : IRequest<Unit>;
public sealed record GetProjectStats(int ProjectId) : IRequest<StatsDto>;
public sealed record StatsDto(int Todo, int InProgress, int Done, int Overdue);

public interface IHandler<TRequest, TResult> where TRequest : IRequest<TResult>
{
    Task<TResult> HandleAsync(TRequest request, CancellationToken ct);
}

public sealed class CompleteTaskHandler(List<string> log) : IHandler<CompleteTask, Unit>
{
    public Task<Unit> HandleAsync(CompleteTask request, CancellationToken ct)
    {
        log.Add($"обработчик: задача {request.TaskId} закрыта");
        return Task.FromResult(default(Unit));
    }
}

public sealed class ReadModel { public StatsDto For(int projectId) => new(4, 2, 9, 1); }     // простая проекция «мимо» домена
public sealed class GetProjectStatsHandler(ReadModel model, List<string> log) : IHandler<GetProjectStats, StatsDto>
{
    public Task<StatsDto> HandleAsync(GetProjectStats request, CancellationToken ct)
    {
        log.Add($"обработчик: читаю проекцию проекта {request.ProjectId}");
        return Task.FromResult(model.For(request.ProjectId));
    }
}

// ====== конвейер ======
public delegate Task<TResult> Next<TResult>();
public interface IBehavior<TRequest, TResult> where TRequest : IRequest<TResult>
{
    Task<TResult> HandleAsync(TRequest request, Next<TResult> next, CancellationToken ct);
}

public sealed class LoggingBehavior<TRequest, TResult>(List<string> log) : IBehavior<TRequest, TResult> where TRequest : IRequest<TResult>
{
    public async Task<TResult> HandleAsync(TRequest request, Next<TResult> next, CancellationToken ct)
    {
        log.Add($"→ {typeof(TRequest).Name}");
        try { var result = await next(); log.Add($"← {typeof(TRequest).Name} (успех)"); return result; }
        catch (Exception e) { log.Add($"✖ {typeof(TRequest).Name}: {e.Message}"); throw; }
    }
}

public interface IValidator<T> { IEnumerable<string> Validate(T request); }
public sealed class CompleteTaskValidator : IValidator<CompleteTask>
{
    public IEnumerable<string> Validate(CompleteTask r) { if (r.TaskId <= 0) yield return "TaskId должен быть положительным"; }
}
public sealed class ValidationException(string message) : Exception(message);

public sealed class ValidationBehavior<TRequest, TResult>(IEnumerable<IValidator<TRequest>> validators) : IBehavior<TRequest, TResult> where TRequest : IRequest<TResult>
{
    public Task<TResult> HandleAsync(TRequest request, Next<TResult> next, CancellationToken ct)
    {
        var errors = validators.SelectMany(v => v.Validate(request)).ToList();
        if (errors.Count > 0) throw new ValidationException(string.Join("; ", errors));     // обработчик не вызывается
        return next();
    }
}

public sealed class Mediator(IServiceProvider services)
{
    public Task<TResult> SendAsync<TRequest, TResult>(TRequest request, CancellationToken ct = default) where TRequest : IRequest<TResult>
    {
        var handler = services.GetRequiredService<IHandler<TRequest, TResult>>();
        Next<TResult> next = () => handler.HandleAsync(request, ct);
        foreach (var behavior in services.GetServices<IBehavior<TRequest, TResult>>().Reverse())    // оборачиваем с конца: первый — снаружи
        {
            var inner = next; var current = behavior;
            next = () => current.HandleAsync(request, inner, ct);
        }
        return next();
    }
}
~~~
~~~console
--- команда с верными данными
    → CompleteTask
    обработчик: задача 7 закрыта
    ← CompleteTask (успех)
--- команда с неверными данными
    → CompleteTask
    ✖ CompleteTask: TaskId должен быть положительным
    исключение наружу: ValidationException
--- запрос (читает проекцию напрямую)
    → GetProjectStats
    обработчик: читаю проекцию проекта 5
    ← GetProjectStats (успех)
    получено: выполнено 9, просрочено 1
~~~

Конвейер сработал так, как описано: логирование окружает всё, валидация стоит внутри, и неверная команда **не дошла** до обработчика — об этом гарантирует структура, а не дисциплина каждого обработчика. Запрос не прошёл через модель домена, а прочитал проекцию напрямую. Это и есть выигрыш CQRS: чтение не обязано таскать за собой доменные объекты, а команды — зависимости чтения.

Цена тоже есть: больше классов и «косвенности» (не сразу видно, кто обрабатывает запрос), поэтому для небольшого проекта прямые обработчики без медиатора, как выше, тоже вариант. Готовая библиотека MediatR делает то же самое, но выводит типы параметров сама. Учти: с 2025 года у MediatR появилась коммерческая лицензия (см. [объявление автора](https://www.jimmybogard.com/automapper-and-mediatr-commercial-editions-launch-today/)); для учебного проекта своих обработчиков достаточно.

### Шаг 5. Как описать паттерн в README (для критерия)

~~~text
### Decorator для статистики проекта
Проблема: GET /projects/{id}/stats выполнял тяжёлый запрос (≈120 мс) на каждом открытии страницы.
Решение: CachedProjectStats оборачивает DbProjectStats и кэширует результат на 30 секунд.
Почему декоратор: логика подсчёта не знает о кэше; кэш можно отключить заменой одной регистрации в DI;
каждый класс тестируется отдельно.
Результат: повторные запросы ≈2 мс.
~~~

Цифры в README должны быть **твоими измерениями**, а не образцом из шаблона: замерь запрос до и после.

## Как это работает под капотом

- **Паттерны опираются на интерфейсы и полиморфизм.** Strategy, Decorator и Factory работают, потому что клиентский код зависит от интерфейса, а не от класса ([интерфейсы](#/ref/c/cl-interfaces)): объект за интерфейсом можно подменить, обернуть или выбрать по условию. Принцип открытости/закрытости (OCP из SOLID) — именно об этом: добавляем новую стратегию классом, не правя старый код.
- **Как контейнер находит ключевой сервис.** При регистрации `AddKeyedSingleton<T, TImpl>(key)` контейнер хранит дескриптор вместе с ключом. `GetKeyedService<T>(key)` ищет дескриптор для пары «тип — ключ», `FromKeyedServices("email")` в параметре эндпоинта делает то же при привязке параметров.
- **Несколько реализаций одного интерфейса.** Запрос `IEnumerable<T>` возвращает все регистрации в порядке регистрации, запрос одиночного `T` — последнюю. Поэтому стратегии удобно собирать в список и выбирать по имени.
- **Декоратор — это композиция.** Он хранит ссылку на «внутренний» объект и делегирует ему вызов, добавляя поведение до и после. Наследование для этого не нужно; поэтому слои можно комбинировать и менять порядок (мы это видели в логе).
- **Как работает конвейер поведений.** Это цепочка делегатов: каждое поведение получает `next` — делегат следующего звена — и решает, вызвать ли его, что сделать до и после, и как обработать исключение. Мы строим цепочку с конца, оборачивая обработчик последовательно. ASP.NET Core middleware устроен точно так же ([middleware](#p4-middleware)).
- **Открытые обобщённые регистрации.** `AddTransient(typeof(IBehavior<,>), typeof(LoggingBehavior<,>))` говорит контейнеру: «для любой пары типов создавай `LoggingBehavior` с теми же параметрами». Ограничения `where` проверяются: поведение подходит только запросам с нужными типами.
- **Что делает CQRS «лёгким».** Мы разделили только код: команды и запросы — отдельные обработчики с минимальными зависимостями, но база данных одна. «Полный» CQRS с отдельными моделями записи и чтения, разными хранилищами и событиями — отдельная, сложная архитектура, для учебного проекта не нужная.
- **Цена паттернов.** Каждый паттерн добавляет классы и уровень косвенности. Окупается, когда боль реальна (изменения разных причин в одном месте, дублирование, невозможность тестировать). Если боли нет, паттерн — нагрузка на читателя кода.

## Типичные ошибки и ловушки

- **Паттерн ради паттерна.** Стратегия с одной реализацией, фабрика на один класс, медиатор на три обработчика.
- **Декоратор, меняющий смысл интерфейса.** Он должен вести себя как оригинал (принцип подстановки Лисков), иначе клиент удивится.
- **Неверный порядок декораторов.** Кэш внутри авторизации или логирование вне/внутри кэша дают разный результат; порядок — часть дизайна.
- **Фабрика, которая прячет зависимости** (Service Locator). Если сервис берёт `IServiceProvider` и вытаскивает всё подряд, зависимости не видны в конструкторе. Допустимо в маленькой фабрике, вредно как стиль.
- **«Бог-обработчик».** Медиатор не спасёт: если обработчик делает всё, он просто переехал в другой класс.
- **Скрытая магия медиатора.** Не видно, кто обрабатывает запрос; отладка усложняется. Проверяй, что команда простая и обработчик найден (тест на регистрацию).
- **Валидация и транзакции в каждом обработчике вручную** вместо поведений конвейера (или наоборот: поведение, которое делает слишком много).
- **Запросы CQRS проходят через доменную модель.** Теряется смысл разделения; читай проекцию напрямую.
- **Декоратор с изменяемым состоянием в singleton** (кэш без учёта ключа, общие поля): гонки и устаревшие данные.
- **Ключи фабрики — «магические строки» по всему коду.** Вынеси константы или перечисление.
- **Лицензия библиотеки не проверена.** Для коммерческой работы убедись, что условия подходят (пример — MediatR).
- **Описание паттерна в README без проблемы и измерений.** Критерий требует объяснить, **что именно решено**.

## Вопросы с собеседований

:::spoiler Чем Strategy отличается от Decorator?
Strategy — взаимозаменяемые алгоритмы одной задачи, выбирается один. Decorator — обёртка, которая добавляет поведение к существующему объекту с тем же интерфейсом; декораторы можно наслаивать.
:::

:::spoiler В чём идея CQRS в лёгком варианте?
Разделить операции изменения (команды) и чтения (запросы) на отдельные обработчики: у каждого свои минимальные зависимости, а запросы могут читать данные напрямую в нужной форме.
:::

:::spoiler Нужна ли фабрика, если есть DI? (ловушка: «нет, DI заменяет всё»)
Часто нужна: когда реализация выбирается во время выполнения по данным (канал уведомлений, тип отчёта). В .NET 8+ роль фабрики может играть контейнер с ключевыми сервисами; если выбор известен при регистрации, фабрика не нужна.
:::

:::spoiler Какую проблему решает паттерн Strategy? Приведи пример.
Заменяет ветвление `if/switch` по типу объектами с общим интерфейсом: расчёт приоритета, правила штрафов, способы доставки. Новый алгоритм — новый класс, существующий код не меняется (принцип открытости/закрытости).
:::

:::spoiler Как добавить кэширование к существующему сервису, не меняя его код?
Декоратор: класс с тем же интерфейсом, который хранит ссылку на настоящий сервис и кэширует результат; регистрируется в DI вместо исходного (вручную или через Scrutor).
:::

:::spoiler Что такое конвейер поведений в медиаторе и чем он похож на middleware?
Цепочка обёрток вокруг обработчика (логирование, валидация, транзакция), каждая получает делегат следующего звена и решает, вызывать ли его. ASP.NET Core middleware устроен по тому же принципу для HTTP-запроса.
:::

:::spoiler Когда паттерн вреден? (ловушка: «никогда, паттерны — это хорошо»)
Когда применён без реальной боли: появляются лишние классы и косвенность, а выгоды нет. Паттерн должен решать конкретную проблему (дублирование, разрастающийся switch, невозможность тестировать), которую можно назвать.
:::

:::spoiler Чем плох Service Locator и как отличить его от фабрики?
Service Locator — когда класс берёт `IServiceProvider` и достаёт зависимости где угодно: зависимости не видны в конструкторе, их сложнее тестировать. Узкая фабрика, зависимость которой явная, а выбор типа — единственная задача, допустима.
:::

## Что запомнить

- Начинай с боли, а не с названия паттерна; паттерн без реальной проблемы — лишний код.
- Strategy заменяет `switch` по типу объектами с общим интерфейсом; несколько реализаций в DI — список по `IEnumerable<T>`.
- Factory — выбор реализации в одном месте; в .NET 8+ готовые ключевые сервисы (`AddKeyedSingleton`, `GetKeyedService`, `[FromKeyedServices]`).
- Decorator реализует тот же интерфейс и оборачивает настоящий объект (кэш, логирование, ретраи); порядок слоёв — часть дизайна; в DI собирается вручную или Scrutor.
- CQRS в лёгком варианте: команды меняют, запросы читают, отдельные маленькие обработчики; медиатор добавляет единую точку и конвейер поведений.
- Все паттерны опираются на интерфейсы и композицию; тестируй стратегии и декораторы отдельно.
- Применение паттерна в README описывай по шаблону: проблема → решение → почему этот паттерн → измеренный результат.

## Практика

- [ ] Применил минимум один паттерн в проекте **по реальной причине** и описал его в README по шаблону
- [ ] Написал тесты на каждую стратегию / на декоратор (с фейковым внутренним объектом)
- [ ] Перевёл 2–3 метода «толстого» сервиса на отдельные обработчики команд и сравнил читаемость

@@page id="p5-git" phase="5" kind="topic" title="Git на профессиональном уровне" nav="Git профессионально" est="4–5 дней"
:::why
В команде Git — это не «сохранить», а способ совместной работы: ветки, ревью, история, по которой можно понять **почему** код такой. Работодатель смотрит на историю коммитов в твоём GitHub так же внимательно, как на код.
:::

## Зачем это нужно

Git — единственный инструмент из этой фазы, который не обсуждается на собеседовании: его знают **все**, и по тому, как ты им пользуешься, видно, работал ли ты в команде. «Умею коммитить и пушить» — уровень первого курса. От джуниора ждут большего:

- работать через короткие ветки и pull request, а не коммитить в `main`;
- писать коммиты, по которым через полгода можно понять, **что и почему** изменилось;
- не бояться конфликтов и уметь разрешать их осознанно;
- исправлять ошибки в истории безопасно: знать, где `revert`, а где `reset`, и не терять работу;
- находить коммит, сломавший поведение, не перечитывая всю историю (`git bisect`).

Критерий фазы — перевод проекта на GitHub flow, три осмысленных PR, разрешённый через rebase конфликт и найденный `bisect`-ом коммит. Всё это ниже не просто описано: примеры запускаются на **настоящем Git** во временном репозитории, а ты видишь реальные результаты команд. Что к GitHub (защита ветки, PR, ревью) в нашей учебной среде проверить нельзя: там нужен аккаунт. Эти части описаны честно и отмечены отдельно.

## Интуиция и аналогия

**История коммитов — журнал в бухгалтерии.** Записи не стирают: ошибку исправляют новой записью (`revert`), а не замазывают старую. «Переписать журнал» (`reset`, `rebase`) допустимо только пока его никто больше не читал, то есть пока ветка твоя личная.

**Ветка — черновик главы.** Ты пишешь главу отдельно, не мешая основной рукописи. Когда глава готова, редактор (ревью) читает и вклеивает её в рукопись (merge). Если за это время в рукописи поменялся предыдущий абзац, нужно сверить стыки: это и есть конфликт.

**Коммит — снимок, а не разница.** Git хранит состояние всех файлов в момент коммита, а «разницу» вычисляет по требованию. Поэтому переключение веток быстрое, а коммит — устойчивая точка, к которой всегда можно вернуться.

**`bisect` — игра «угадай число».** «Версия 1 хорошая, версия 64 плохая»: проверяем середину, отбрасываем половину, за ~6 проверок находим виновника среди сотен коммитов.

## Основная теория по шагам

### Шаг 1. Модель ветвления

| Подход | Суть | Когда |
|---|---|---|
| **Trunk-based / GitHub flow** | короткие ветки от `main`, PR, слияние в `main`, `main` всегда рабочий | большинство современных команд, твои проекты |
| **Git flow** | ветки `develop`, `release/*`, `hotfix/*` | продукты с редкими релизами и поддержкой нескольких версий |

Для портфолио: **GitHub flow**. Каждая задача — ветка `feature/task-comments`, PR с описанием, слияние после зелёного CI ([CI](#p5-ci)). Ветка живёт дни, не недели: чем она дольше, тем больнее конфликты.

На стороне GitHub к flow относится защита ветки `main`: в настройках репозитория (Settings → Branches / Rules) включаются «требовать pull request», «требовать прохождения проверок» и «запретить force push». Это настройки сайта, а не команды Git, поэтому здесь они не запускались: проверь результат сам, попытавшись запушить в `main` напрямую.

### Шаг 2. Хорошие коммиты

~~~text
feat(tasks): запретить закрытие задачи без исполнителя

Раньше задача без AssigneeId могла перейти в Done, и статистика
исполнителей считала её «ничьей». Правило перенесено в TaskItem.Complete,
добавлены тесты на оба случая.
~~~

- Заголовок до ~70 символов в повелительном наклонении: *что делает* коммит.
- Тело — **почему**, а не пересказ диффа (дифф и так виден).
- Один логический шаг — один коммит. Префиксы `feat`, `fix`, `refactor`, `test`, `docs` (Conventional Commits) делают историю читаемой и позволяют автоматически собирать список изменений.
- Не смешивай рефакторинг и новое поведение в одном коммите: ревьюеру (и `bisect`-у) будет трудно.

### Шаг 3. Настоящий Git на глазах: ветки, merge, rebase

Чтобы не гадать, что делают команды, запустим Git во временном каталоге. Вспомогательный класс `Repo` вызывает `git` как процесс и возвращает его вывод; автор и даты зафиксированы, чтобы результат был одинаковым при каждом запуске, а хэши мы не печатаем (они зависят от времени).

Сценарий: в `main` один коммит; от него отходит ветка `feature` с двумя коммитами; пока мы работали, в `main` появился ещё один. Сравним два способа обновить результат.

~~~csharp
using System.Diagnostics;

var root = Path.Combine(Path.GetTempPath(), "git-demo-" + Guid.NewGuid().ToString("N"));

Repo Scenario(string name)
{
    var r = new Repo(Path.Combine(root, name));
    r.Git("init", "-q", "-b", "main");
    r.Commit("a.txt", "основа", "chore: начальный коммит");
    r.Git("switch", "-q", "-c", "feature");
    r.Commit("b.txt", "1", "feat: первая часть");
    r.Commit("b.txt", "2", "feat: вторая часть");
    r.Git("switch", "-q", "main");
    r.Commit("c.txt", "хотфикс", "fix: срочная правка в main");
    return r;
}

// ---------- merge ----------
var m = Scenario("merge");
m.Git("merge", "--no-edit", "feature");
Console.WriteLine("merge — история (граф):");
Console.WriteLine(Indent(m.Git("log", "--graph", "--format=%s")));
Console.WriteLine($"коммитов с двумя родителями (коммит слияния): {m.Git("rev-list", "--merges", "--count", "HEAD")}");

// ---------- rebase ----------
var r = Scenario("rebase");
var before = r.Git("rev-parse", "feature");
r.Git("switch", "-q", "feature");
r.Git("rebase", "main");
var after = r.Git("rev-parse", "feature");
r.Git("switch", "-q", "main");
r.Git("merge", "--ff-only", "feature");                    // main просто «подтягивается»
Console.WriteLine("\nrebase — история (граф):");
Console.WriteLine(Indent(r.Git("log", "--graph", "--format=%s")));
Console.WriteLine($"коммитов слияния: {r.Git("rev-list", "--merges", "--count", "HEAD")}");
Console.WriteLine($"хэш последнего коммита ветки feature изменился: {before != after}");

// ---------- --force-with-lease: защита от чужих коммитов ----------
var origin = new Repo(Path.Combine(root, "origin.git"));
origin.Git("init", "-q", "--bare", "-b", "main");
r.Git("remote", "add", "origin", origin.Dir);
r.Git("push", "-q", "origin", "main", "feature");
// «коллега» отправил в feature свой коммит, о котором мы не знаем
var colleague = new Repo(Path.Combine(root, "colleague"));
colleague.Git("clone", "-q", origin.Dir, colleague.Dir);
colleague.Git("switch", "-q", "feature");
colleague.Commit("d.txt", "коллега", "feat: правка коллеги");
colleague.Git("push", "-q", "origin", "feature");
// мы перебазируем и пытаемся отправить
r.Git("switch", "-q", "feature");
r.Commit("e.txt", "моё", "feat: моя правка");
r.Git("commit", "-q", "--amend", "-m", "feat: моя правка (поправлена)");
var lease = r.Git("push", "--force-with-lease", "origin", "feature");
Console.WriteLine($"\npush --force-with-lease при чужом коммите отклонён: {r.LastExit != 0}");
var force = r.Git("push", "--force", "origin", "feature");
Console.WriteLine($"push --force прошёл и затёр коммит коллеги: {r.LastExit == 0 && !origin.Git("log", "feature", "--format=%s").Contains("правка коллеги")}");

Directory.Delete(root, true);

static string Indent(string text) => string.Join("\n", text.Split('\n').Select(l => "    " + l));

public sealed class Repo(string dir)
{
    public string Dir => dir;
    public int LastExit { get; private set; }

    public string Git(params string[] args)
    {
        Directory.CreateDirectory(dir);
        var psi = new ProcessStartInfo("git") { WorkingDirectory = dir, RedirectStandardOutput = true, RedirectStandardError = true };
        foreach (var a in args) psi.ArgumentList.Add(a);
        psi.Environment["GIT_CONFIG_GLOBAL"] = "/dev/null";
        psi.Environment["GIT_CONFIG_SYSTEM"] = "/dev/null";
        psi.Environment["GIT_AUTHOR_NAME"] = psi.Environment["GIT_COMMITTER_NAME"] = "Учебный Автор";
        psi.Environment["GIT_AUTHOR_EMAIL"] = psi.Environment["GIT_COMMITTER_EMAIL"] = "dev@example.com";
        psi.Environment["GIT_AUTHOR_DATE"] = psi.Environment["GIT_COMMITTER_DATE"] = "2026-01-01T12:00:00+00:00";
        psi.Environment["GIT_EDITOR"] = "true";
        psi.Environment["LANG"] = psi.Environment["LC_ALL"] = "C";
        using var p = Process.Start(psi)!;
        var output = p.StandardOutput.ReadToEnd() + p.StandardError.ReadToEnd();
        p.WaitForExit();
        LastExit = p.ExitCode;
        return output.TrimEnd();
    }

    public void Commit(string file, string content, string message)
    {
        File.WriteAllText(Path.Combine(dir, file), content + "\n");
        Git("add", file);
        Git("commit", "-q", "-m", message);
    }
}
~~~
~~~console
merge — история (граф):
    *   Merge branch 'feature'
    |\  
    | * feat: вторая часть
    | * feat: первая часть
    * | fix: срочная правка в main
    |/  
    * chore: начальный коммит
коммитов с двумя родителями (коммит слияния): 1

rebase — история (граф):
    * feat: вторая часть
    * feat: первая часть
    * fix: срочная правка в main
    * chore: начальный коммит
коммитов слияния: 0
хэш последнего коммита ветки feature изменился: True

push --force-with-lease при чужом коммите отклонён: True
push --force прошёл и затёр коммит коллеги: True
~~~

Разница видна в графе: `merge` честно показывает, что работа шла параллельно, и добавляет **коммит слияния**; `rebase` переносит коммиты ветки поверх свежего `main`, история линейная, но хэши перенесённых коммитов **другие**, потому что у них новый родитель. Именно поэтому нельзя перебазировать ветку, которую уже взяли коллеги: у них останутся старые коммиты. В конце примера `--force-with-lease` отказал, заметив чужой коммит на сервере, а голый `--force` молча стёр работу коллеги. Это и есть правило: после rebase публиковать только через `--force-with-lease`.

| | `merge` | `rebase` |
|---|---|---|
| История | сохраняется как была + коммит слияния | линейная, коммиты переписаны |
| Безопасность | не меняет существующие коммиты | меняет хэши коммитов |
| Правило | можно всегда | **не ребейзить общие ветки**, в которые коммитят другие |

В GitHub при слиянии PR выбирают стиль: Merge commit, Squash and merge (вся ветка одним коммитом) или Rebase and merge. Для небольших веток с шумной историей («fix», «ещё fix») удобен squash: в `main` остаётся один осмысленный коммит с описанием из PR.

### Шаг 4. Конфликты

Конфликт возникает, когда две ветки изменили **одни и те же строки** по-разному. Git не угадывает, а останавливается и просит человека. Создадим его специально (это пункт практики) и разрешим через rebase:

~~~csharp
using System.Diagnostics;

var root = Path.Combine(Path.GetTempPath(), "git-conflict-" + Guid.NewGuid().ToString("N"));
var r = new Repo(root);
r.Git("init", "-q", "-b", "main");
r.Commit("Complete.cs", "if (task.Done) { /* позже */ }", "chore: заготовка");
r.Git("switch", "-q", "-c", "feature/idempotent-complete");
r.Commit("Complete.cs", "if (task.Done) return;", "feat: повторное закрытие игнорируется");
r.Git("switch", "-q", "main");
r.Commit("Complete.cs", "if (task.Done) throw new ConflictException();", "feat: повторное закрытие даёт 409");

r.Git("switch", "-q", "feature/idempotent-complete");
var output = r.Git("rebase", "main");
Console.WriteLine($"rebase остановился с ошибкой: {r.LastExit != 0}");
Console.WriteLine("Сообщение Git (первая строка): " + output.Split('\n').First(l => l.StartsWith("CONFLICT")));
Console.WriteLine("Статус: " + r.Git("status", "--porcelain"));

Console.WriteLine("Файл с маркерами:");
foreach (var line in File.ReadAllLines(Path.Combine(root, "Complete.cs")))
    Console.WriteLine("    " + (line.StartsWith("<<<<<<<") ? "<<<<<<< (текущая сторона: main)" : line.StartsWith(">>>>>>>") ? ">>>>>>> (твой коммит)" : line));

// Разрешение: понять намерение обеих сторон. Решили оставить исключение 409 (требование API), а повтор считать ошибкой.
File.WriteAllText(Path.Combine(root, "Complete.cs"), "if (task.Done) throw new ConflictException(); // повтор — ошибка 409, идемпотентность через Idempotency-Key\n");
r.Git("add", "Complete.cs");
r.Git("rebase", "--continue");
Console.WriteLine($"rebase завершён: {r.LastExit == 0}");
Console.WriteLine("История:\n" + string.Join("\n", r.Git("log", "--format=%s").Split('\n').Select(l => "    " + l)));
Console.WriteLine("Маркеров в файле не осталось: " + !File.ReadAllText(Path.Combine(root, "Complete.cs")).Contains("<<<<<<<"));

Directory.Delete(root, true);

public sealed class Repo(string dir)
{
    public int LastExit { get; private set; }

    public string Git(params string[] args)
    {
        Directory.CreateDirectory(dir);
        var psi = new ProcessStartInfo("git") { WorkingDirectory = dir, RedirectStandardOutput = true, RedirectStandardError = true };
        foreach (var a in args) psi.ArgumentList.Add(a);
        psi.Environment["GIT_CONFIG_GLOBAL"] = "/dev/null";
        psi.Environment["GIT_CONFIG_SYSTEM"] = "/dev/null";
        psi.Environment["GIT_AUTHOR_NAME"] = psi.Environment["GIT_COMMITTER_NAME"] = "Учебный Автор";
        psi.Environment["GIT_AUTHOR_EMAIL"] = psi.Environment["GIT_COMMITTER_EMAIL"] = "dev@example.com";
        psi.Environment["GIT_AUTHOR_DATE"] = psi.Environment["GIT_COMMITTER_DATE"] = "2026-01-01T12:00:00+00:00";
        psi.Environment["GIT_EDITOR"] = "true";
        psi.Environment["LANG"] = psi.Environment["LC_ALL"] = "C";
        using var p = Process.Start(psi)!;
        var output = p.StandardOutput.ReadToEnd() + p.StandardError.ReadToEnd();
        p.WaitForExit();
        LastExit = p.ExitCode;
        return output.TrimEnd();
    }

    public void Commit(string file, string content, string message)
    {
        File.WriteAllText(Path.Combine(dir, file), content + "\n");
        Git("add", file);
        Git("commit", "-q", "-m", message);
    }
}
~~~
~~~console
rebase остановился с ошибкой: True
Сообщение Git (первая строка): CONFLICT (content): Merge conflict in Complete.cs
Статус: UU Complete.cs
Файл с маркерами:
    <<<<<<< (текущая сторона: main)
    if (task.Done) throw new ConflictException();
    =======
    if (task.Done) return;
    >>>>>>> (твой коммит)
rebase завершён: True
История:
    feat: повторное закрытие игнорируется
    feat: повторное закрытие даёт 409
    chore: заготовка
Маркеров в файле не осталось: True
~~~

Алгоритм разрешения конфликта:

1. Понять **намерение** обеих сторон (а не выбрать «свою»): здесь одна ветка делала повтор безвредным, другая требовала `409`. Это вопрос продукта, а не Git, и иногда нужно спросить автора.
2. Отредактировать файл до правильного итогового кода, удалить маркеры `<<<<<<<`, `=======`, `>>>>>>>`.
3. Собрать проект и прогнать тесты: конфликт без ошибок слияния всё равно может сломать логику.
4. `git add` + `git rebase --continue` (или `git commit` при merge). Передумал: `git rebase --abort` вернёт всё как было.

Заметь слова «текущая сторона» и «твой коммит»: при rebase стороны **перевёрнуты** по сравнению с merge. Git применяет твои коммиты по одному поверх `main`, поэтому «HEAD» в маркерах — это `main`, а твоя правка — «входящая». Это частая путаница.

### Шаг 5. Починить историю: amend, revert, reset, reflog, bisect

Здесь опасные команды, поэтому лучше увидеть, что они делают, на одноразовом репозитории. Поищем сломавший коммит и сравним способы отката:

~~~csharp
using System.Diagnostics;

var root = Path.Combine(Path.GetTempPath(), "git-fix-" + Guid.NewGuid().ToString("N"));
var r = new Repo(root);
r.Git("init", "-q", "-b", "main");
for (int i = 1; i <= 8; i++)
    r.Commit("calc.txt", i < 5 ? $"ok {i}" : $"broken {i}", $"feat: шаг {i}");
// В шаге 5 появилась поломка (в файле слово broken). Тест — «в файле нет broken».
// ---------- bisect ----------
r.Git("bisect", "start", "HEAD", "HEAD~7");                                  // плохой — текущий, хороший — первый
r.Git("bisect", "run", "sh", "-c", "! grep -q broken calc.txt");
var culprit = r.Git("log", "-1", "--format=%s", "refs/bisect/bad");
r.Git("bisect", "reset");
Console.WriteLine($"bisect нашёл виновника: {culprit}");

// ---------- revert: безопасная отмена ----------
int Count() => int.Parse(r.Git("rev-list", "--count", "HEAD"));
Console.WriteLine($"\nкоммитов до revert: {Count()}");
r.Git("revert", "--no-edit", "HEAD");
Console.WriteLine($"после revert: {Count()} (история выросла, последний коммит: {r.Git("log", "-1", "--format=%s")})");

// ---------- reset --hard: переписывает историю и теряет изменения ----------
var tip = r.Git("rev-parse", "HEAD");
r.Git("reset", "--hard", "HEAD~2");
Console.WriteLine($"\nпосле reset --hard HEAD~2: {Count()} коммитов, последний: {r.Git("log", "-1", "--format=%s")}");

// ---------- reflog: страховка ----------
r.Git("reset", "--hard", tip);                                              // вернуть по записи из reflog
Console.WriteLine($"восстановили через reflog/хэш: {Count()} коммитов");

// ---------- amend: поправить последний, ещё не опубликованный коммит ----------
r.Git("commit", "--amend", "-q", "-m", "feat: шаг 8 (поправленное сообщение)");
Console.WriteLine($"\nпосле amend число коммитов то же ({Count()}), сообщение: {r.Git("log", "-1", "--format=%s")}");

// ---------- stash: убрать незавершённое на время ----------
File.WriteAllText(Path.Combine(root, "calc.txt"), "правка в процессе\n");
Console.WriteLine($"\nизменений в рабочем каталоге до stash: {r.Git("status", "--porcelain").Split('\n', StringSplitOptions.RemoveEmptyEntries).Length}");
r.Git("stash", "push", "-q");
Console.WriteLine($"после stash: {r.Git("status", "--porcelain").Split('\n', StringSplitOptions.RemoveEmptyEntries).Length}");
r.Git("stash", "pop", "-q");
Console.WriteLine($"после stash pop: {r.Git("status", "--porcelain").Split('\n', StringSplitOptions.RemoveEmptyEntries).Length}, содержимое: {File.ReadAllText(Path.Combine(root, "calc.txt")).Trim()}");

Directory.Delete(root, true);

public sealed class Repo(string dir)
{
    public int LastExit { get; private set; }

    public string Git(params string[] args)
    {
        Directory.CreateDirectory(dir);
        var psi = new ProcessStartInfo("git") { WorkingDirectory = dir, RedirectStandardOutput = true, RedirectStandardError = true };
        foreach (var a in args) psi.ArgumentList.Add(a);
        psi.Environment["GIT_CONFIG_GLOBAL"] = "/dev/null";
        psi.Environment["GIT_CONFIG_SYSTEM"] = "/dev/null";
        psi.Environment["GIT_AUTHOR_NAME"] = psi.Environment["GIT_COMMITTER_NAME"] = "Учебный Автор";
        psi.Environment["GIT_AUTHOR_EMAIL"] = psi.Environment["GIT_COMMITTER_EMAIL"] = "dev@example.com";
        psi.Environment["GIT_AUTHOR_DATE"] = psi.Environment["GIT_COMMITTER_DATE"] = "2026-01-01T12:00:00+00:00";
        psi.Environment["GIT_EDITOR"] = "true";
        psi.Environment["LANG"] = psi.Environment["LC_ALL"] = "C";
        using var p = Process.Start(psi)!;
        var output = p.StandardOutput.ReadToEnd() + p.StandardError.ReadToEnd();
        p.WaitForExit();
        LastExit = p.ExitCode;
        return output.TrimEnd();
    }

    public void Commit(string file, string content, string message)
    {
        File.WriteAllText(Path.Combine(dir, file), content + "\n");
        Git("add", file);
        Git("commit", "-q", "-m", message);
    }
}
~~~
~~~console
bisect нашёл виновника: feat: шаг 5

коммитов до revert: 8
после revert: 9 (история выросла, последний коммит: Revert "feat: шаг 8")

после reset --hard HEAD~2: 7 коммитов, последний: feat: шаг 7
восстановили через reflog/хэш: 9 коммитов

после amend число коммитов то же (9), сообщение: feat: шаг 8 (поправленное сообщение)

изменений в рабочем каталоге до stash: 1
после stash: 0
после stash pop: 1, содержимое: правка в процессе
~~~

`bisect` нашёл первый плохой коммит автоматически: команда `bisect run` запускает твой тест (код возврата 0 — хорошо, иначе плохо) и сама двигается по истории. Для реального проекта тест — это `dotnet test --filter …`. Условие — тест должен падать **именно из-за** искомой ошибки и быть стабильным, иначе бисекция укажет не туда.

Пять команд, которые стоит различать:

| Команда | Что делает | Безопасно для общей ветки? |
|---|---|---|
| `commit --amend` | заменяет последний коммит | нет, если он уже опубликован |
| `revert <hash>` | новый коммит, отменяющий старый | **да** |
| `reset --hard <hash>` | двигает ветку и стирает правки в каталоге | нет |
| `reflog` | журнал перемещений HEAD — спасение после ошибки | локально |
| `stash` | прячет незакоммиченное | локально |

### Шаг 6. Pull request с описанием — даже для себя

~~~text Шаблон описания PR
## Что сделано
Комментарии к задачам: создание, редактирование своих, удаление своих.

## Зачем
Обсуждение задачи сейчас уходит в мессенджер и теряется.

## Как проверить
1. docker compose up --build
2. Запросы из tests/comments.http
3. dotnet test — 12 новых тестов

## Что осталось / компромиссы
Нет пагинации комментариев — при >100 на задачу понадобится.
~~~

Положи шаблон в файл `.github/pull_request_template.md`: GitHub подставит его в каждый новый PR. Этикет ревью: комментируй код, а не человека; объясняй «почему»; отличай обязательное от вкусовщины (`nit:`). PR должен быть небольшим: ревьюер вдумчиво читает до ~300 строк, дальше начинает пролистывать.

### Шаг 7. Полезные команды

~~~bash
git log --oneline --graph --decorate -20    # история веток
git commit --amend                          # поправить последний (ещё не отправленный) коммит
git rebase -i HEAD~4                        # навести порядок в коммитах ветки до PR (в терминале)
git stash / git stash pop                   # временно убрать незакоммиченные изменения
git bisect start                            # бинарный поиск коммита, который сломал поведение
git revert <hash>                           # отменить коммит новым коммитом (безопасно для общей истории)
git reflog                                  # где был HEAD раньше: спасение после ошибочного reset
git restore --staged <file>                 # убрать файл из индекса, не трогая изменения
git switch -                                # вернуться на предыдущую ветку
~~~

Интерактивный rebase (`rebase -i`) открывает редактор со списком коммитов, поэтому в автоматическом примере не запускался: там `pick` меняют на `squash`, `reword`, `drop` и переставляют строки. Применяй его только к своим неопубликованным коммитам.

## Как это работает под капотом

- **Объекты.** Git — это база «содержимое → хэш». Файл хранится как *blob*, каталог как *tree*, снимок как *commit* (ссылка на tree, на родителя, автор, сообщение). Хэш коммита зависит от всего перечисленного, поэтому изменение родителя меняет хэш: так rebase «переписывает» коммиты, фактически создавая новые.
- **Ветка — это указатель.** Файл с хэшем одного коммита. `git switch -c` создаёт новый указатель за мгновение, поэтому ветки дёшевы, и их нужно использовать свободно.
- **HEAD** указывает на текущую ветку (или напрямую на коммит — «detached HEAD»). Коммит двигает указатель текущей ветки вперёд.
- **Три области.** Рабочий каталог → индекс (`git add`, подготовка снимка) → репозиторий (`git commit`). `reset --hard` перезаписывает все три, `restore --staged` трогает только индекс.
- **Merge** создаёт коммит с двумя родителями. Если ветка просто впереди (нет расхождения), выполняется *fast-forward*: указатель сдвигается, лишнего коммита нет (мы использовали `--ff-only`).
- **Rebase** берёт коммиты ветки, вычисляет их изменения и применяет по очереди поверх новой базы, создавая новые коммиты. Старые остаются в базе, пока их не удалит сборка мусора (по умолчанию не раньше чем через несколько недель), поэтому после ошибки их можно найти в `reflog`.
- **Конфликт** возникает при трёхстороннем слиянии: Git берёт общего предка и две вершины; если обе стороны изменили одну область по-разному, он ставит маркеры. Разные части одного файла сливаются автоматически.
- **`--force-with-lease`.** Перед отправкой Git сверяет, что удалённая ветка там же, где ты видел её в последний раз; если нет, отказывает (мы это проверили). Голый `--force` не проверяет ничего.
- **`bisect`** — бинарный поиск по линейному отрезку истории: ⌈log₂ N⌉ проверок вместо N.
- **Remote.** `origin` — просто имя сохранённого адреса. `fetch` скачивает объекты и обновляет `origin/main`; `pull` = `fetch` + `merge` (или `rebase` с флагом).

## Типичные ошибки и ловушки

- **Коммиты прямо в `main`.** Нет ревью, нет CI, откат сложнее. Защити ветку.
- **Мегакоммит «всё сразу» или «fix», «fix2», «правки».** История не помогает понять причину изменений.
- **Rebase общей ветки** и принудительный push: у коллег разъезжаются истории.
- **`git push --force` вместо `--force-with-lease`**: можно затереть чужие коммиты.
- **Слепое разрешение конфликта «взять свою версию»**: чужая правка исчезает без следа. Конфликт — вопрос смысла.
- **Не собрали проект после разрешения конфликта.** Маркеров нет, а код не компилируется или логика сломана.
- **Секреты в истории.** Пароль, ключ API или строка подключения, закоммиченные один раз, остаются в истории даже после удаления файла. Считай такой секрет скомпрометированным: смени его; очистка истории — дополнительная мера, не замена.
- **Большие бинарные файлы и `bin/`, `obj/` в репозитории.** Нужен `.gitignore` (в .NET: `dotnet new gitignore`).
- **`reset --hard` без проверки, что нужного нет только в рабочем каталоге.** Незакоммиченные правки теряются безвозвратно (в отличие от закоммиченных, которые спасёт `reflog`).
- **Долгоживущие ветки.** Чем дольше живёт ветка, тем больнее слияние. Делай ветки короткими и сливай часто.
- **PR на тысячи строк без описания.** Ревьюер не читает, а скользит. Дроби и объясняй.
- **`git add .` не глядя.** Проверяй `git status` и `git diff --staged`, чтобы не закоммитить лишнее.

## Вопросы с собеседований

:::spoiler Чем merge отличается от rebase?
Merge объединяет ветки коммитом слияния, не меняя существующие коммиты. Rebase переносит коммиты ветки поверх новой базы, создавая новые коммиты (новые хэши), и даёт линейную историю.
:::

:::spoiler Почему нельзя делать rebase общей ветки?
Rebase переписывает коммиты (меняются хэши). У коллег останутся старые версии коммитов, и истории разойдутся: дубли, конфликты, потерянная работа.
:::

:::spoiler Чем revert отличается от reset?
`revert` создаёт новый коммит, отменяющий изменения, — история не переписывается, безопасно для общих веток. `reset` передвигает указатель ветки назад — история переписывается.
:::

:::spoiler Чем `--force-with-lease` лучше `--force`? (ловушка: «они одинаковые»)
`--force` перезаписывает удалённую ветку безусловно. `--force-with-lease` сначала проверяет, что удалённая ветка находится там, где ты её последний раз видел; если кто-то успел добавить коммит, отправка отклоняется.
:::

:::spoiler Что такое fast-forward слияние?
Если целевая ветка является прямым предком сливаемой, Git просто сдвигает указатель вперёд без коммита слияния. Запретить такое поведение можно флагом `--no-ff`.
:::

:::spoiler Как найти коммит, который сломал поведение?
`git bisect`: отмечаешь плохой и хороший коммиты, Git делит отрезок пополам, ты (или скрипт через `bisect run`) говоришь «хорошо/плохо», и за логарифм шагов находится первый плохой коммит.
:::

:::spoiler Я закоммитил пароль и сразу удалил файл следующим коммитом. Всё ли в порядке? (ловушка)
Нет. Пароль остался в истории и доступен через предыдущие коммиты. Секрет нужно считать скомпрометированным и сменить; чистка истории — дополнительная мера.
:::

:::spoiler Я случайно сделал `reset --hard` и потерял коммиты. Что делать?
Посмотреть `git reflog`: там записаны прежние положения HEAD. Найти хэш нужного коммита и вернуться на него (`git reset --hard <hash>` или создать ветку). Незакоммиченные изменения так не вернуть.
:::

:::spoiler Что такое squash-слияние и когда оно полезно?
Все коммиты ветки сжимаются в один при слиянии PR. Удобно, когда в ветке шумная история (исправления, «ещё fix»), а в `main` нужен один осмысленный коммит.
:::

## Что запомнить

- GitHub flow: короткие ветки от `main`, PR с описанием, слияние после зелёного CI; `main` защищён и всегда рабочий.
- Коммит — один логический шаг; в заголовке *что*, в теле *почему*; префиксы Conventional Commits.
- Merge сохраняет историю и добавляет коммит слияния; rebase делает историю линейной, но меняет хэши, поэтому **не ребейзь общие ветки**.
- После rebase публикуй только `--force-with-lease`.
- Конфликт — вопрос смысла: пойми намерение обеих сторон, собери проект, прогони тесты; при rebase стороны «перевёрнуты».
- Безопасная отмена общей истории — `revert`; `reset --hard` переписывает историю, спасение — `reflog`.
- `git bisect run` с тестом находит сломавший коммит за логарифм шагов.
- Секреты в истории считай скомпрометированными; `.gitignore` нужен с первого коммита.

## Практика

- [ ] Перевёл свой проект на GitHub flow: защищённая ветка `main`, работа только через PR
- [ ] Сделал 3 PR с описанием по шаблону и самостоятельным ревью
- [ ] Специально создал конфликт в двух ветках и разрешил его через rebase
- [ ] Нашёл коммит, сломавший тест, с помощью `git bisect`

@@page id="p5-ci" phase="5" kind="topic" title="CI: GitHub Actions" nav="CI: GitHub Actions" est="3–4 дня"
:::why
**Пункт критерия: CI настроен и зелёный.** Непрерывная интеграция гарантирует, что каждый push собирается и проходит тесты на чистой машине, а не только «у меня работает». Зелёный значок в README — маленькая деталь, которую замечают рекрутеры.
:::

## Зачем это нужно

Без CI проверка проекта зависит от дисциплины: «я же запускал тесты». Люди забывают, уезжают в отпуск, запускают на машине, где давно лежат нужные файлы и настроена своя культура. CI (Continuous Integration — непрерывная интеграция) убирает человеческий фактор: на **каждый** push и PR автоматически поднимается **чистая** виртуальная машина, скачивается код, устанавливается SDK, собирается проект и запускаются тесты. Красный результат виден всем и блокирует слияние.

Что это даёт тебе как джуниору:

- проект в портфолио выглядит как рабочий проект: рекрутер видит значок и историю зелёных прогонов;
- ты получаешь уверенность при рефакторинге ([тесты](#p5-unit-tests) срабатывают сами);
- ты учишься читать логи упавших сборок, а это ежедневная работа в команде;
- на собеседовании можешь ответить, чем CI отличается от CD и почему «у меня локально проходит» ничего не значит.

Честная оговорка об этой странице: сам GitHub Actions в нашей учебной среде запустить нельзя (нужен аккаунт и репозиторий на сайте). Поэтому проверено только то, что можно проверить на месте: структура workflow разобрана парсером YAML, а команды, из которых он состоит (`dotnet restore`, `build --no-restore`, `test`), и главные причины красного CI («у меня работает») запускаются ниже вживую. Всё остальное — описание поведения GitHub — взято из документации и помечено как таковое.

## Интуиция и аналогия

**CI — это чистая кухня для проверки рецепта.** Дома у тебя «всё под рукой»: соль уже стоит, духовка прогрета, нужная кастрюля лежит. Рецепт кажется рабочим. CI даёт пустую кухню: если по записанным шагам блюдо получилось, рецепт действительно полный. Если нет, значит, ты полагался на то, чего в рецепте нет (файл, переменная окружения, локальная база, часовой пояс).

**Workflow — рецепт для робота.** Ты описываешь шаги (скачай код, поставь SDK, собери, проверь), а робот выполняет их одинаково каждый раз. Скучно, зато предсказуемо.

**Защита ветки — турникет.** Без неё зелёный CI — рекомендация, с ней — условие прохода: красный PR не пускают в `main`.

## Основная теория по шагам

### Шаг 1. Из чего состоит workflow

Workflow в GitHub Actions — YAML-файл в каталоге `.github/workflows/`. Структура:

- **`on`** — события-триггеры (push, pull_request, расписание, ручной запуск);
- **`jobs`** — задания; каждое выполняется на своём раннере (виртуальной машине) и по умолчанию **параллельно** с другими;
- **`steps`** внутри задания — последовательные шаги: либо готовое действие (`uses:`), либо команда (`run:`);
- **действие (action)** — переиспользуемый шаг, например `actions/checkout`.

### Шаг 2. Минимальный workflow

~~~yaml .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [ main ]
  pull_request:
    branches: [ main ]

jobs:
  build-and-test:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-dotnet@v4
        with:
          dotnet-version: '10.0.x'      # та же версия, что и TargetFramework проекта

      - name: Restore
        run: dotnet restore

      - name: Build
        run: dotnet build --no-restore --configuration Release

      - name: Test
        run: dotnet test --no-build --configuration Release --verbosity normal
~~~

Разберём по строкам:

- `on: push` на `main` и `pull_request` в `main` — проверка и самой ветки, и каждого PR. Если оставить только `push`, PR из ветки не проверяется до слияния, а это главный смысл CI.
- `runs-on: ubuntu-latest` — чистая Linux-машина. Если проект зависит от Windows-специфики, выбери `windows-latest`, но для бэкенда на .NET Linux обычно быстрее и дешевле.
- `checkout` скачивает код: на чистой машине его ещё нет.
- `setup-dotnet` ставит нужный SDK. Версию держи согласованной с `TargetFramework` и `global.json`; актуальные версии самих действий проверяй на странице действия в GitHub Marketplace (мажорные версии выходят регулярно).
- Три отдельных шага `restore`, `build`, `test` нужны, чтобы в логе было видно, **на каком этапе** упало. Флаги `--no-restore` и `--no-build` запрещают повторять уже сделанную работу.

На раннерах `ubuntu-latest` установлен Docker, поэтому Testcontainers из [интеграционных тестов](#p5-integration) работают без дополнительной настройки (по документации GitHub; в нашей среде Docker недоступен, так что здесь это не запускалось).

### Шаг 3. Проверяем то, что можно проверить: структура и команды

Структуру файла разберём парсером YAML: он проверяет, что файл вообще корректен, что есть триггеры, задание и шаги, и что у каждого шага есть либо `uses`, либо `run`. Это простейший аналог линтера для workflow (для боевого использования есть отдельные инструменты, например `actionlint`, но они здесь не запускались):

~~~python @nocheck
import yaml
wf = yaml.safe_load(open(".github/workflows/ci.yml"))
triggers = wf[True]                      # ключ `on` YAML 1.1 читает как булево True — известная особенность
print("триггеры:", sorted(triggers))
job = wf["jobs"]["build-and-test"]
print("раннер:", job["runs-on"])
for step in job["steps"]:
    kind = "uses" if "uses" in step else "run"
    print(f"  {kind}: {step.get('uses') or step['run']}")
~~~

Результат разбора (запускали на этом же файле, вынутом из страницы):

~~~console
триггеры: ['pull_request', 'push']
раннер: ubuntu-latest
  uses: actions/checkout@v4
  uses: actions/setup-dotnet@v4
  run: dotnet restore
  run: dotnet build --no-restore --configuration Release
  run: dotnet test --no-build --configuration Release --verbosity normal
~~~

Теперь команды. Проверим вживую, зачем в workflow строгий порядок и что произойдёт, если нарушить его: `build --no-restore` на «свежем» проекте (на чистой машине) должен упасть, а после `restore` пройти. Пример создаёт временный консольный проект и вызывает настоящий `dotnet`:

~~~csharp
using System.Diagnostics;

var dir = Path.Combine(Path.GetTempPath(), "ci-demo-" + Guid.NewGuid().ToString("N"));
Directory.CreateDirectory(dir);
File.WriteAllText(Path.Combine(dir, "App.csproj"), """
    <Project Sdk="Microsoft.NET.Sdk">
      <PropertyGroup><OutputType>Exe</OutputType><TargetFramework>net10.0</TargetFramework></PropertyGroup>
    </Project>
    """);
File.WriteAllText(Path.Combine(dir, "Program.cs"), "System.Console.WriteLine(\"привет из CI\");\n");

(int Code, string Out) Dotnet(params string[] args)
{
    var psi = new ProcessStartInfo("dotnet") { WorkingDirectory = dir, RedirectStandardOutput = true, RedirectStandardError = true };
    foreach (var a in args) psi.ArgumentList.Add(a);
    psi.Environment["DOTNET_NOLOGO"] = "1";
    psi.Environment["DOTNET_CLI_TELEMETRY_OPTOUT"] = "1";
    psi.Environment["DOTNET_CLI_HOME"] = dir;
    using var p = Process.Start(psi)!;
    var o = p.StandardOutput.ReadToEnd() + p.StandardError.ReadToEnd();
    p.WaitForExit();
    return (p.ExitCode, o);
}

var noRestore = Dotnet("build", "--no-restore");
Console.WriteLine($"1. build --no-restore до restore: код выхода ненулевой: {noRestore.Code != 0}, причина: {(noRestore.Out.Contains("NETSDK1004") ? "NETSDK1004 (не найден файл project.assets.json — restore не выполнялся)" : "другая")}");

var restore = Dotnet("restore");
Console.WriteLine($"2. restore: успешно: {restore.Code == 0}");
var build = Dotnet("build", "--no-restore", "--configuration", "Release");
Console.WriteLine($"3. build --no-restore после restore: успешно: {build.Code == 0}");
var run = Dotnet("run", "--no-build", "--configuration", "Release");
Console.WriteLine($"4. run --no-build: {run.Out.Trim()}");

// ломаем код — «красный CI»: ошибка компиляции даёт ненулевой код выхода, и именно по нему GitHub красит шаг
File.WriteAllText(Path.Combine(dir, "Program.cs"), "System.Console.WriteLine(\"привет\")\n");   // нет точки с запятой
var broken = Dotnet("build", "--no-restore", "--configuration", "Release");
Console.WriteLine($"5. сломанный код: код выхода ненулевой (шаг станет красным): {broken.Code != 0}, ошибка компиляции CS1002: {broken.Out.Contains("CS1002")}");

Directory.Delete(dir, true);
~~~
~~~console
1. build --no-restore до restore: код выхода ненулевой: True, причина: NETSDK1004 (не найден файл project.assets.json — restore не выполнялся)
2. restore: успешно: True
3. build --no-restore после restore: успешно: True
4. run --no-build: привет из CI
5. сломанный код: код выхода ненулевой (шаг станет красным): True, ошибка компиляции CS1002: True
~~~

Вывод: каждый шаг workflow — обычная команда, и любая ненулевая завершённость делает шаг красным, а он останавливает остальные. Поэтому перед пушем **повторяй CI локально** теми же командами и в том же порядке (на чистом клоне это самый честный тест).

### Шаг 4. Почему «у меня работает», а в CI падает

Чаще всего виновато окружение. Покажем два типичных случая воспроизводимо: зависимость от культуры и от текущего времени.

~~~csharp
using System.Globalization;

// 1. Формат чисел зависит от культуры машины. Тест «ожидаем 1234,5» зависит от настроек, в которых запущен.
decimal price = 1234.5m;
// настоящие культуры ru-RU и en-US зависят от данных ОС (в урезанных контейнерах их может не быть), поэтому формат русской записи задаём вручную
var ruLike = new NumberFormatInfo { NumberDecimalSeparator = ",", NumberGroupSeparator = " " };
var enLike = new NumberFormatInfo { NumberDecimalSeparator = ".", NumberGroupSeparator = "," };
Console.WriteLine($"как на русской машине: {price.ToString("N1", ruLike)}");
Console.WriteLine($"как на английской машине: {price.ToString("N1", enLike)}");
Console.WriteLine($"Инвариантная культура: {price.ToString("N1", CultureInfo.InvariantCulture)}  ← так тест не зависит от машины");

// 2. Тест, зависящий от DateTime.Now, проходит днём и падает в полночь (или в другом часовом поясе).
//    Решение — TimeProvider (встроен в .NET 8+): время подменяется в тесте.
var clock = new FixedTime(new DateTimeOffset(2026, 1, 31, 23, 59, 0, TimeSpan.Zero));
var policy = new TrialPolicy(clock);
var started = new DateTimeOffset(2026, 1, 1, 0, 0, 0, TimeSpan.Zero);
Console.WriteLine($"\n30 дней пробного периода, сейчас {clock.GetUtcNow():yyyy-MM-dd HH:mm}: истёк = {policy.IsExpired(started, days: 30)}");
clock.Set(new DateTimeOffset(2026, 1, 30, 23, 0, 0, TimeSpan.Zero));
Console.WriteLine($"Часы перевели назад, сейчас {clock.GetUtcNow():yyyy-MM-dd HH:mm}: истёк = {policy.IsExpired(started, days: 30)}");

public sealed class TrialPolicy(TimeProvider time)
{
    public bool IsExpired(DateTimeOffset start, int days) => time.GetUtcNow() >= start.AddDays(days);
}

public sealed class FixedTime(DateTimeOffset now) : TimeProvider
{
    private DateTimeOffset _now = now;
    public void Set(DateTimeOffset value) => _now = value;
    public override DateTimeOffset GetUtcNow() => _now;
}
~~~
~~~console
как на русской машине: 1 234,5
как на английской машине: 1,234.5
Инвариантная культура: 1,234.5  ← так тест не зависит от машины

30 дней пробного периода, сейчас 2026-01-31 23:59: истёк = True
Часы перевели назад, сейчас 2026-01-30 23:00: истёк = False
~~~

Первая часть показывает: одна и та же программа печатает разное в зависимости от культуры (настройки региона), а на раннере GitHub она может отличаться от твоей. Мы задали форматы вручную, потому что в контейнере, где проверялся пример, нет данных настоящих культур, и это само по себе пример «окружение отличается». Вторая: время подменяется в тесте (`TimeProvider` встроен в .NET 8+), и результат не зависит от момента запуска.

### Шаг 5. Значок в README

~~~text
![CI](https://github.com/<логин>/<репозиторий>/actions/workflows/ci.yml/badge.svg)
~~~

Подставь свой логин и имя репозитория; значок покажет статус последнего прогона. Адрес устроен по шаблону из документации GitHub; в нашей среде открыть его нельзя, так что после добавления проверь, что картинка отображается на странице репозитория.

### Шаг 6. Обязательная проверка и защита ветки

Workflow сам по себе только сообщает о результате. Чтобы красный PR нельзя было слить, в настройках репозитория (Settings → Branches / Rules) включи правило для `main`: «требовать прохождения проверок» (required status checks) и выбери задание `build-and-test`. Выбрать проверку можно только после того, как workflow хотя бы раз отработал, потому что GitHub узнаёт имена проверок из истории прогонов. Это настройка на сайте, поэтому здесь она не проверялась.

### Шаг 7. Полезные улучшения (когда базовый вариант работает)

~~~yaml .github/workflows/ci.yml (расширенный вариант)
name: CI

on:
  push:
    branches: [ main ]
  pull_request:
    branches: [ main ]

permissions:
  contents: read                      # минимально необходимые права токена

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true            # новый push отменяет прогон по старому коммиту

jobs:
  build-and-test:
    runs-on: ubuntu-latest
    timeout-minutes: 15               # зависший тест не съест все минуты

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-dotnet@v4
        with:
          dotnet-version: '10.0.x'

      - run: dotnet restore
      - run: dotnet build --no-restore --configuration Release
      - run: dotnet test --no-build --configuration Release --logger "trx" --results-directory TestResults

      - name: Сохранить результаты тестов
        if: always()                  # даже если тесты упали
        uses: actions/upload-artifact@v4
        with:
          name: test-results
          path: TestResults
~~~

- `permissions` по принципу наименьших привилегий: токену не нужна запись, если workflow только проверяет.
- `concurrency` экономит минуты: старый прогон на устаревшем коммите отменяется.
- `timeout-minutes` ограничивает зависшие шаги (по умолчанию лимит очень большой).
- `if: always()` выполняет шаг, даже если предыдущие упали: файлы результатов нужны именно при падении.
- Секреты (`${{ secrets.NAME }}`) задаются в Settings → Secrets and variables → Actions и **не попадают** в код; в логах GitHub маскирует их значения.

Структуру расширенного варианта проверили тем же парсером YAML (синтаксис корректен, у каждого шага есть `uses` или `run`); сам запуск на GitHub не выполнялся.

## Как это работает под капотом

- **Раннер.** GitHub создаёт для каждого задания новую виртуальную машину, выполняет шаги и уничтожает её. Ничто не сохраняется между прогонами, кроме явного кэша и артефактов. Поэтому в CI нет «залежавшихся» файлов, и поэтому здесь вылезают скрытые зависимости.
- **Триггеры.** GitHub следит за событиями репозитория и сопоставляет их с `on:` в файлах workflow на нужном коммите. Для `pull_request` workflow берётся из **результата слияния** ветки PR с целевой веткой, то есть проверяется то, что реально получится в `main`.
- **Код выхода как контракт.** Шаг `run` считается успешным, если процесс вернул 0 (мы это видели на примере сборки). Любой другой код делает шаг, задание и проверку красными; следующие шаги по умолчанию пропускаются, кроме `if: always()` / `if: failure()`.
- **Задания параллельны.** Если одно задание зависит от другого (сборка, затем деплой), это выражается ключом `needs:`. Данные между заданиями передаются артефактами, потому что машины разные.
- **Действия (`uses:`).** Это репозитории с кодом, которые GitHub скачивает по тегу (`@v4`). Закрепление по мажорной версии получает исправления, а закрепление по полному хэшу коммита безопаснее: тег можно переписать.
- **Токен `GITHUB_TOKEN`.** Автоматически выдаётся каждому прогону, живёт только на время прогона, а его права задаются блоком `permissions`.
- **Секреты и форки.** Для PR из чужого форка секреты по умолчанию недоступны (иначе любой мог бы вытащить их, прислав PR с вредоносным кодом). Событие `pull_request_target` обходит это ограничение и потому опасно: не запускай с ним непроверенный код из PR.
- **Тесты в CI и Docker.** Раннер Linux запускает контейнеры, поэтому тесты с Testcontainers работают так же, как локально, но стартуют медленнее; в CI ставь разумные таймауты.
- **CI и CD.** CI отвечает «код собирается и проходит тесты», CD (Continuous Delivery/Deployment) — «проверенную сборку выкладываем в окружение». Деплой разберём в [следующей фазе](#p6-cicd).

## Типичные ошибки и ловушки

- **Локально проходит, в CI падает.** Зависимость от локальной базы, файла, часового пояса, культуры, `DateTime.Now`, переменной окружения. Чини причину, а не «перезапусти и повезёт».
- **Тесты падают через раз (flaky).** Общее изменяемое состояние, порядок тестов, гонки, реальные задержки (`Task.Delay`). Нестабильный тест хуже отсутствующего: команда перестаёт верить красному.
- **Версия SDK в `setup-dotnet` не совпадает с проектом.** Сборка не находит SDK или таргет. Согласуй с `TargetFramework` и `global.json`.
- **Секрет в коде или логе.** Пароль, закоммиченный в workflow, виден всем. Используй Secrets; не печатай значения `echo`-ом.
- **Workflow запускается только по `push`.** PR не проверяется до слияния. Добавь `pull_request`.
- **Required check не включён.** Зелёный значок есть, а красный PR всё равно сливают. Включи защиту ветки.
- **Выбор проверки в защите невозможен.** Правило нельзя настроить, пока workflow ни разу не запускался: запусти и только потом выбирай проверку.
- **Игнорирование предупреждений как «шум».** В CI используй `-warnaserror` или анализаторы там, где проект готов, иначе предупреждения копятся.
- **Бесконечные прогоны.** Нет `timeout-minutes`, зависший тест сжигает лимит минут.
- **Слепая вера в зелёный.** CI зелёный, но тестов нет или они ничего не проверяют. Следи за покрытием осмысленных сценариев ([тесты](#p5-unit-tests)).
- **Использование `pull_request_target` с кодом из PR.** Даёт чужому коду доступ к секретам.
- **`dotnet test` без `--no-build` после отдельного build.** Сборка выполняется дважды: это не ошибка, но лишняя трата времени.

## Вопросы с собеседований

:::spoiler Что такое CI и чем оно отличается от CD?
CI — автоматическая сборка и проверка (тесты, анализаторы) при каждом изменении кода. CD — доставка или развёртывание проверенной сборки в окружение (ручное подтверждение или автоматически).
:::

:::spoiler Зачем `--no-restore` и `--no-build` в следующих шагах?
Чтобы не повторять уже сделанную работу: restore и build выполнены отдельными шагами. Это ускоряет workflow и делает лог понятнее (видно, на каком шаге упало). Но порядок обязателен: `--no-restore` без предварительного restore падает.
:::

:::spoiler Тесты проходят локально, а в CI падают. Что проверишь? (ловушка: «перезапущу»)
Различия окружения: версия SDK, культура и часовой пояс, `DateTime.Now`, локальные файлы и базы, переменные окружения, порядок и параллельность тестов. Затем воспроизведу локально на чистом клоне теми же командами.
:::

:::spoiler Как не дать слить PR с красным CI?
В защите ветки включить required status checks и выбрать нужное задание (после того как workflow хотя бы раз отработал). Дополнительно можно потребовать ревью и актуальность ветки.
:::

:::spoiler Где хранить пароли и ключи для CI?
В Secrets репозитория (или окружения) и подставлять через `${{ secrets.NAME }}`. В код и файлы репозитория их класть нельзя; значения в логах маскируются, но печатать их всё равно не нужно.
:::

:::spoiler Что такое flaky-тест и как с ним бороться?
Тест, результат которого меняется без изменения кода: из-за гонок, времени, порядка, внешних ресурсов. Нужно устранить причину (убрать зависимость от времени и сети, изолировать состояние), а не добавлять повторы.
:::

:::spoiler Чем опасен `pull_request_target`? (ловушка)
Он запускается в контексте целевой ветки с доступом к секретам. Если запустить с ним код из PR, чужой код получит секреты. Безопасная схема для проверки чужого кода — обычный `pull_request`.
:::

:::spoiler Как ускорить CI?
Кэшировать зависимости, запускать независимые задания параллельно, не повторять restore/build, отменять устаревшие прогоны (`concurrency`), делить тесты на быстрые и медленные, ограничить таймауты.
:::

## Что запомнить

- CI запускает сборку и тесты на чистой машине при каждом push и PR; workflow — YAML в `.github/workflows/`.
- Структура: `on` → `jobs` → `steps` (`uses` или `run`); шаг красный, если код выхода не нулевой.
- Порядок restore → build → test с `--no-restore` и `--no-build`; тот же порядок повторяй локально перед пушем.
- Триггер `pull_request` обязателен, иначе PR не проверяется.
- Красный PR блокируется только защитой ветки (required status checks); сама по себе проверка ничего не запрещает.
- «Локально работает» — вопрос окружения: культура, время, файлы, база; время подменяй через `TimeProvider`.
- Секреты хранятся в Secrets, а не в коде; права токена ограничивай блоком `permissions`.
- Здесь проверены команды и структура YAML; сам запуск на GitHub, защита ветки и значок проверяются в твоём репозитории.

## Практика

- [ ] Добавил workflow, CI зелёный на `main`
- [ ] Включил обязательную проверку CI для слияния PR
- [ ] Добавил значок в README
- [ ] Специально сломал тест в ветке, убедился, что PR нельзя слить, починил

