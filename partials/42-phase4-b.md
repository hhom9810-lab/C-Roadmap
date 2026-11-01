@@page id="p4-architecture" phase="4" kind="topic" title="Слоистая архитектура, DTO и маппинг" nav="Слои, DTO, маппинг" est="1,5 недели"
:::why
Когда весь код в контроллерах, через три месяца любое изменение — это раскопки. Слои дают каждому коду своё место: правила предметной области не знают про HTTP, а контроллеры не знают про SQL. На собеседовании просят «расскажи архитектуру своего проекта» — после этой темы тебе будет что нарисовать.
:::

## Зачем это нужно

Первое работающее API обычно выглядит так: контроллер принимает запрос, сам проверяет поля, сам лезет в `DbContext`, сам считает бизнес-правила и сам собирает ответ. Пока эндпоинтов три — это нормально. Через три месяца в одном методе перемешаны HTTP, SQL и правила: чтобы поменять правило «нельзя закрыть задачу без исполнителя», нужно найти все копии проверки в разных контроллерах; чтобы протестировать правило, нужно поднять веб-сервер и базу; чтобы поменять базу, нужно переписать половину приложения.

Слоистая архитектура — это договорённость, **какой код где живёт** и **кто от кого зависит**:

- правила предметной области (что такое «задача», когда её можно закрыть) — в одном месте, без HTTP и без SQL, и тестируются мгновенно;
- сценарии («закрыть задачу», «создать проект») — отдельно, оркеструют домен и хранилище;
- детали инфраструктуры (EF Core, почта, часы) — снаружи, их можно заменить;
- HTTP-слой остаётся тонким: разобрать запрос, вызвать сценарий, превратить результат в ответ.

Отдельная тема — **DTO** (data transfer object): объекты, которые описывают то, что API принимает и отдаёт, независимо от внутренних сущностей. Без них в проект приходят две классические беды: клиент может записать в сущность поля, которые не должен менять (overposting), а в ответ могут утечь внутренности (хэш пароля, служебные поля).

Тема всегда всплывает на собеседованиях: «Расскажи архитектуру проекта», «Зачем DTO, если есть сущности?», «Где лежат бизнес-правила?», «Что такое инверсия зависимостей на практике?». После этой темы ты не просто нарисуешь схему, а покажешь, что каждое правило проверено кодом: ниже домен и сервис запускаются без базы и без HTTP, а overposting воспроизводится на живом сервере.

## Интуиция и аналогия

**Ресторан.** Зал (Api) принимает заказы и подаёт блюда: официант говорит с гостем и не знает рецептов. Кухня (Application) координирует: «этот заказ — сначала холодный цех, потом горячий». Шеф-повар и его правила (Domain) знают, что борщ без свёклы борщом не называется, и не зависят ни от гостя, ни от поставщика. Склад и поставщики (Infrastructure) — внешний мир: продукты можно купить у другого поставщика, рецепт от этого не изменится. Заметь направление: официант знает кухню, кухня — правила, а **правила не знают ни официанта, ни поставщика**.

**Меню и кладовая.** DTO — это меню: гость видит то, что для него подготовлено, и заказывает по нему. Он не заходит в кладовую и не показывает на сырые продукты. Сущность — содержимое кладовой: внутреннее устройство, которое можно переставлять, не меняя меню.

**Розетка и вилка.** Application объявляет интерфейс (`ITaskRepository`) — «мне нужна розетка такой формы». Infrastructure делает вилку: реализацию на EF Core. Application не знает, что за стеной, — поэтому в тестах можно воткнуть заглушку.

## Основная теория по шагам

### Шаг 1. Четыре слоя и направление зависимостей

~~~text
 ┌──────────────────────────────────────────────┐
 │ Api (Presentation)                           │  эндпоинты/контроллеры, DTO запросов и ответов,
 │   TaskBoard.Api                              │  Program.cs, middleware, конфигурация
 └───────────────┬──────────────────────────────┘
                 │ зависит от
 ┌───────────────▼──────────────────────────────┐
 │ Application                                  │  сценарии (сервисы), валидация, интерфейсы
 │   TaskBoard.Application                      │  для инфраструктуры (ITaskRepository, IClock)
 └───────────────┬──────────────────────────────┘
                 │ зависит от
 ┌───────────────▼──────────────────────────────┐
 │ Domain                                       │  сущности, бизнес-правила, доменные исключения
 │   TaskBoard.Domain                           │  НИ ОТ ЧЕГО не зависит
 └──────────────────────────────────────────────┘
 ┌──────────────────────────────────────────────┐
 │ Infrastructure                               │  EF Core DbContext, миграции, реализации
 │   TaskBoard.Infrastructure                   │  репозиториев, отправка почты, часы
 └──────────────────────────────────────────────┘  зависит от Application и Domain
~~~

Главное правило: **зависимости направлены внутрь**, к домену. Domain не ссылается ни на EF Core, ни на ASP.NET Core. Infrastructure **реализует** интерфейсы, объявленные в Application (это [инверсия зависимостей](#p2-solid)), а Api собирает всё вместе в `Program.cs` (это место называют *composition root* — корень композиции).

~~~bash Структура решения
dotnet new sln -n TaskBoard
dotnet new classlib -n TaskBoard.Domain
dotnet new classlib -n TaskBoard.Application
dotnet new classlib -n TaskBoard.Infrastructure
dotnet new webapi   -n TaskBoard.Api
dotnet sln add TaskBoard.Domain TaskBoard.Application TaskBoard.Infrastructure TaskBoard.Api

dotnet add TaskBoard.Application    reference TaskBoard.Domain
dotnet add TaskBoard.Infrastructure reference TaskBoard.Application TaskBoard.Domain
dotnet add TaskBoard.Api            reference TaskBoard.Application TaskBoard.Infrastructure
~~~

Компилятор теперь сам не даст домену сослаться на инфраструктуру — у проекта просто нет такой ссылки. Это сильнее любого устного соглашения: нарушение правил архитектуры превращается из «замечания на ревью» в ошибку сборки.

Честная оговорка: для маленького проекта четыре сборки — это уже «перебор». Многие команды начинают с одного проекта и тех же четырёх **папок**, а выделяют сборки, когда проект вырос. Для учебного проекта разделение на проекты полезно именно как тренировка: ты видишь границы и ссылки.

### Шаг 2. Domain: правила живут в сущностях

~~~csharp TaskBoard.Domain/TaskItem.cs @nocheck
public enum TaskStatus { Todo, InProgress, Done }

public sealed class TaskItem
{
    public int Id { get; private set; }
    public string Title { get; private set; }
    public TaskStatus Status { get; private set; } = TaskStatus.Todo;
    public int ProjectId { get; private set; }
    public int? AssigneeId { get; private set; }
    public DateTime? CompletedAt { get; private set; }

    public TaskItem(int projectId, string title)
    {
        ProjectId = projectId;
        Title = string.IsNullOrWhiteSpace(title) ? throw new DomainException("Название задачи обязательно") : title.Trim();
    }

    public void Complete(DateTime now)
    {
        if (Status == TaskStatus.Done) throw new ConflictException("Задача уже закрыта");
        if (AssigneeId is null) throw new DomainException("Нельзя закрыть задачу без исполнителя");
        Status = TaskStatus.Done;
        CompletedAt = now;
    }

    public void AssignTo(int userId)
    {
        if (Status == TaskStatus.Done) throw new ConflictException("Нельзя переназначить закрытую задачу");
        AssigneeId = userId;
        if (Status == TaskStatus.Todo) Status = TaskStatus.InProgress;
    }
}

public class DomainException(string message) : Exception(message);
public sealed class ConflictException(string message) : DomainException(message);
public sealed class NotFoundException(string message) : DomainException(message);
public sealed class ForbiddenException(string message) : DomainException(message);
~~~

`private set` и методы-действия — это [инкапсуляция из Фазы 1](#p1-encapsulation), только теперь в настоящем API. EF Core умеет заполнять свойства с `private set`. Главная идея: **сущность сама охраняет свои инварианты**. Невозможно получить задачу в состоянии «закрыта, но исполнителя нет», потому что единственный путь к закрытию — метод `Complete`, который это проверяет.

:::warn Имя `TaskStatus`
В .NET уже есть `System.Threading.Tasks.TaskStatus`. Внутри своего пространства имён твой тип победит, но в файлах, где подключены оба (а `System.Threading.Tasks` подключается неявно при `ImplicitUsings`), будет конфликт имён. Многие команды называют такие типы `TaskItemStatus`, чтобы не спорить с BCL.
:::

### Шаг 3. Application: сценарии

~~~csharp TaskBoard.Application/Tasks/TaskService.cs @nocheck
public interface ITaskRepository
{
    Task<TaskItem?> FindAsync(int id, CancellationToken ct);
    void Add(TaskItem task);
    Task SaveChangesAsync(CancellationToken ct);
}

public interface IClock { DateTime UtcNow { get; } }

public sealed class TaskService(ITaskRepository tasks, IClock clock)
{
    public async Task CompleteAsync(int taskId, CancellationToken ct)
    {
        var task = await tasks.FindAsync(taskId, ct) ?? throw new NotFoundException($"Задача {taskId} не найдена");
        task.Complete(clock.UtcNow);          // правило проверяет домен
        await tasks.SaveChangesAsync(ct);     // один SaveChanges на сценарий
    }
}
~~~

Сервис не знает ни про HTTP, ни про SQL: он получает задачу из абстрактного репозитория, просит её выполнить действие и сохраняет. Благодаря интерфейсам его можно запустить на заглушках — как раз это мы сейчас и сделаем. Ниже — тот же домен и сервис, дополненные заглушкой репозитория в памяти и фиксированными часами; никакой базы и никакого HTTP:

~~~csharp
var repo = new InMemoryTaskRepository();
var clock = new FixedClock(new DateTime(2026, 10, 28, 12, 0, 0, DateTimeKind.Utc));
var service = new TaskService(repo, clock);

try { new TaskItem(1, "   "); }
catch (DomainException ex) { Console.WriteLine("создание с пустым названием: " + ex.Message); }

var task = new TaskItem(projectId: 1, title: "  Сверстать форму входа ");
repo.Add(task);
Console.WriteLine($"создана: «{task.Title}», статус {task.Status}");

async Task Try(string label, Func<Task> action)
{
    try { await action(); Console.WriteLine($"{label}: ок"); }
    catch (DomainException ex) { Console.WriteLine($"{label}: {ex.GetType().Name} — {ex.Message}"); }
}

await Try("закрыть без исполнителя     ", () => service.CompleteAsync(1, default));
task.AssignTo(userId: 7);
Console.WriteLine($"назначена на 7, статус {task.Status}");
await Try("закрыть с исполнителем      ", () => service.CompleteAsync(1, default));
await Try("закрыть повторно            ", () => service.CompleteAsync(1, default));
await Try("закрыть несуществующую (99) ", () => service.CompleteAsync(99, default));
Console.WriteLine($"итог: {task.Status}, закрыта {task.CompletedAt:u}, сохранений в «базе»: {repo.Saves}");

public enum TaskStatus { Todo, InProgress, Done }

public sealed class TaskItem
{
    public int Id { get; set; }
    public string Title { get; private set; }
    public TaskStatus Status { get; private set; } = TaskStatus.Todo;
    public int ProjectId { get; private set; }
    public int? AssigneeId { get; private set; }
    public DateTime? CompletedAt { get; private set; }

    public TaskItem(int projectId, string title)
    {
        ProjectId = projectId;
        Title = string.IsNullOrWhiteSpace(title) ? throw new DomainException("Название задачи обязательно") : title.Trim();
    }

    public void Complete(DateTime now)
    {
        if (Status == TaskStatus.Done) throw new ConflictException("Задача уже закрыта");
        if (AssigneeId is null) throw new DomainException("Нельзя закрыть задачу без исполнителя");
        Status = TaskStatus.Done;
        CompletedAt = now;
    }

    public void AssignTo(int userId)
    {
        if (Status == TaskStatus.Done) throw new ConflictException("Нельзя переназначить закрытую задачу");
        AssigneeId = userId;
        if (Status == TaskStatus.Todo) Status = TaskStatus.InProgress;
    }
}

public class DomainException(string message) : Exception(message);
public sealed class ConflictException(string message) : DomainException(message);
public sealed class NotFoundException(string message) : DomainException(message);

public interface ITaskRepository
{
    Task<TaskItem?> FindAsync(int id, CancellationToken ct);
    void Add(TaskItem task);
    Task SaveChangesAsync(CancellationToken ct);
}
public interface IClock { DateTime UtcNow { get; } }

public sealed class TaskService(ITaskRepository tasks, IClock clock)
{
    public async Task CompleteAsync(int taskId, CancellationToken ct)
    {
        var task = await tasks.FindAsync(taskId, ct) ?? throw new NotFoundException($"Задача {taskId} не найдена");
        task.Complete(clock.UtcNow);
        await tasks.SaveChangesAsync(ct);
    }
}

// заглушки — то, что в тестах (и в этом примере) подставляется вместо EF Core и системных часов
public sealed class InMemoryTaskRepository : ITaskRepository
{
    private readonly Dictionary<int, TaskItem> _items = new();
    public int Saves { get; private set; }
    public void Add(TaskItem task) { task.Id = _items.Count + 1; _items[task.Id] = task; }
    public Task<TaskItem?> FindAsync(int id, CancellationToken ct) => Task.FromResult(_items.GetValueOrDefault(id));
    public Task SaveChangesAsync(CancellationToken ct) { Saves++; return Task.CompletedTask; }
}
public sealed class FixedClock(DateTime now) : IClock { public DateTime UtcNow => now; }
~~~
~~~console
создание с пустым названием: Название задачи обязательно
создана: «Сверстать форму входа», статус Todo
закрыть без исполнителя     : DomainException — Нельзя закрыть задачу без исполнителя
назначена на 7, статус InProgress
закрыть с исполнителем      : ок
закрыть повторно            : ConflictException — Задача уже закрыта
закрыть несуществующую (99) : NotFoundException — Задача 99 не найдена
итог: Done, закрыта 2026-10-28 12:00:00Z, сохранений в «базе»: 1
~~~

Правила домена проверены без единой строки инфраструктуры; сервис не сохранил ничего, пока правило не пропустило операцию (счётчик сохранений равен единице — на единственную успешную операцию). Такой тест выполняется за миллисекунды — это и есть главная практическая награда за слои.

### Шаг 4. DTO: контракт API отдельно от сущностей

~~~csharp TaskBoard.Api/Contracts @nocheck
public sealed record CreateTaskRequest(string Title, int? AssigneeId);
public sealed record TaskResponse(int Id, string Title, string Status, int? AssigneeId, DateTime? CompletedAt);
~~~

Почему не отдавать и не принимать сущности напрямую:

- **Overposting:** клиент присылает `"status": "Done"` или чужой `projectId` — и они попадают в базу.
- **Утечка внутренностей:** хэш пароля пользователя в JSON-ответе — реальный класс инцидентов.
- **Циклы:** `Project.Tasks[0].Project.Tasks…` — сериализатор падает или выдаёт мегабайты.
- **Стабильность контракта:** переименовал свойство в базе — сломал всех клиентов. С DTO контракт меняется осознанно.

Воспроизведём первые две проблемы на настоящем сервере: один эндпоинт принимает и возвращает сущность напрямую, другой — через DTO.

~~~csharp
using System.Net.Http.Json;

var builder = WebApplication.CreateBuilder();
builder.WebHost.UseUrls("http://127.0.0.1:0");
builder.Logging.ClearProviders();
var app = builder.Build();

var saved = new List<UserEntity>();

// ❌ сущность наружу и внутрь
app.MapPost("/entity/users", (UserEntity user) => { saved.Add(user); return Results.Ok(user); });

// ✅ DTO: принимаем только разрешённое, отдаём только нужное
app.MapPost("/dto/users", (RegisterRequest request) =>
{
    var user = new UserEntity { Name = request.Name, PasswordHash = "hash:" + request.Password.Length };   // IsAdmin остаётся false
    saved.Add(user);
    return Results.Ok(new UserResponse(user.Name));
});

await app.StartAsync();
using var http = new HttpClient { BaseAddress = new Uri(app.Urls.First()) };

// «хитрый» клиент добавляет в тело лишнее поле isAdmin
var body = new { name = "mallory", password = "secret", isAdmin = true, passwordHash = "подмена" };

var r1 = await http.PostAsJsonAsync("/entity/users", body);
Console.WriteLine("сущность наружу: " + await r1.Content.ReadAsStringAsync());
Console.WriteLine($"   в «базе»: IsAdmin = {saved[0].IsAdmin}, PasswordHash = «{saved[0].PasswordHash}»");

var r2 = await http.PostAsJsonAsync("/dto/users", body);
Console.WriteLine("через DTO:       " + await r2.Content.ReadAsStringAsync());
Console.WriteLine($"   в «базе»: IsAdmin = {saved[1].IsAdmin}, PasswordHash = «{saved[1].PasswordHash}»");
await app.StopAsync();

public sealed class UserEntity
{
    public string Name { get; set; } = "";
    public string PasswordHash { get; set; } = "";
    public bool IsAdmin { get; set; }
}
public sealed record RegisterRequest(string Name, string Password);
public sealed record UserResponse(string Name);
~~~
~~~console
сущность наружу: {"name":"mallory","passwordHash":"подмена","isAdmin":true}
   в «базе»: IsAdmin = True, PasswordHash = «подмена»
через DTO:       {"name":"mallory"}
   в «базе»: IsAdmin = False, PasswordHash = «hash:6»
~~~

Первая версия сделала клиента администратором, позволила подменить хэш пароля и вернула этот хэш в ответе. Вторая сохранила только то, что разрешено, а лишние поля из JSON просто проигнорировала. Это не теоретический риск: overposting (mass assignment) — известная категория уязвимостей.

Теперь циклы. Проект знает свои задачи, а задача — свой проект; сериализатор, который идёт по ссылкам, зацикливается:

~~~csharp
using System.Text.Encodings.Web;
using System.Text.Json;

var project = new Project { Name = "TaskBoard" };
var task = new ProjectTask { Title = "Форма входа", Project = project };
project.Tasks.Add(task);

try { JsonSerializer.Serialize(project); }
catch (JsonException ex) { Console.WriteLine("сущности: " + ex.GetType().Name + " — " + ex.Message.Split(". ")[0]); }

var dto = new ProjectResponse(project.Name, project.Tasks.Select(t => t.Title).ToList());
Console.WriteLine("через DTO: " + JsonSerializer.Serialize(dto, new JsonSerializerOptions { Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping }));

class Project { public string Name { get; set; } = ""; public List<ProjectTask> Tasks { get; } = new(); }
class ProjectTask { public string Title { get; set; } = ""; public Project Project { get; set; } = null!; }
record ProjectResponse(string Name, List<string> Tasks);
~~~
~~~console
сущности: JsonException — A possible object cycle was detected
через DTO: {"Name":"TaskBoard","Tasks":["Форма входа"]}
~~~

Можно заставить сериализатор молча игнорировать циклы (`ReferenceHandler.IgnoreCycles`), но это лечение симптома: ответ всё равно содержит внутреннюю структуру и растёт при любом изменении модели.

### Шаг 5. Маппинг

~~~csharp Ручной маппинг — явный, быстрый, легко отлаживается @nocheck
public static class TaskMappings
{
    public static TaskResponse ToResponse(this TaskItem t) =>
        new(t.Id, t.Title, t.Status.ToString(), t.AssigneeId, t.CompletedAt);
}

// в запросе EF лучше сразу проецировать — тогда в SQL уйдут только нужные столбцы:
// var page = await db.Tasks.Where(...).Select(t => new TaskResponse(t.Id, t.Title, t.Status.ToString(), t.AssigneeId, t.CompletedAt)).ToListAsync(ct);
~~~

| Подход | Плюсы | Минусы |
|---|---|---|
| Ручные методы `ToResponse()` | явно, ошибки видны компилятору, нет магии | больше кода |
| Mapster | мало кода, умеет проекции в `IQueryable` | соглашения неявны, ошибки — в рантайме |
| AutoMapper | очень распространён в существующих проектах | то же; с 2025 года новые версии распространяются по коммерческой лицензии — проверь условия перед использованием |

Для портфолио-проекта ручной маппинг — нормальный и честный выбор. Библиотеку стоит знать, чтобы читать чужие проекты. Ключевое преимущество ручного маппинга: при добавлении поля в `TaskResponse` компилятор покажет все места, где его нужно заполнить; у «автоматических» мапперов пропущенное поле всплывёт в рантайме (или не всплывёт вообще — значение окажется `null` или по умолчанию).

## Как это работает под капотом

- **Ссылки проектов — это граф.** `ProjectReference` в `.csproj` определяет, какие сборки видны друг другу. Нет ссылки — нет типов; поэтому архитектурные границы можно задать *структурой решения*, а не договорённостями. Для проверки правил внутри одного проекта существуют библиотеки архитектурных тестов (они читают сборки через рефлексию и проверяют, что одни пространства имён не ссылаются на другие).
- **Инверсия зависимостей на практике.** Интерфейс `ITaskRepository` лежит в Application (там, где он нужен), а реализация — в Infrastructure (там, где известна EF Core). Во время выполнения `Program.cs` регистрирует `AddScoped<ITaskRepository, EfTaskRepository>()`, и контейнер подставляет реализацию. Поэтому слой Application компилируется без единой ссылки на EF.
- **Как EF Core заполняет `private set`.** При материализации EF использует рефлексию (и конструкторы с параметрами, совпадающими по имени со свойствами) и записывает значения в свойства и поля, минуя публичный интерфейс. Конструктор `TaskItem(int projectId, string title)` с параметрами-свойствами EF тоже умеет использовать; для остальных свойств он применяет закрытые сеттеры.
- **Привязка модели и overposting.** Десериализатор JSON заполняет все публичные свойства типа, которые встретит в теле, — не спрашивая, должен ли клиент их менять. Поэтому тип запроса должен содержать *только* поля, которые разрешено присылать.
- **Сериализация ответа.** `System.Text.Json` рекурсивно обходит публичные свойства объекта; при циклической ссылке на глубине 64 бросает `JsonException`. У сущностей EF циклы — норма (навигации в обе стороны), у DTO — нет.
- **Исключения домена и HTTP.** Домен бросает исключения своего типа (`ConflictException`, `NotFoundException`), ничего не зная о кодах `409`/`404`; в слое Api один обработчик превращает их в ответы (тема про [ошибки](#p4-errors)). Так домен остаётся независимым от HTTP.
- **Сквозные вещи.** Логирование, транзакции, валидацию иногда выносят в «конвейер» вокруг сценариев (декораторы, MediatR-подобные поведения). Для старта хватает явных вызовов: один `SaveChanges` на сценарий.
- **Цена слоёв.** Каждый слой — дополнительные классы и маппинг. Если сценарий — «прочитать список и отдать» без правил, слой Application превращается в простую пересылку; не бойся читать данные проекцией прямо из `DbContext` в эндпоинте для таких запросов, а слои оставь для команд с правилами.

## Типичные ошибки и ловушки

- **Сущности EF в контроллерах и ответах.** Утечки, циклы, overposting.
- **Бизнес-правила в контроллерах.** Их копируют в трёх местах, а тестировать приходится через HTTP.
- **«Анемичный» домен.** Сущности — просто мешки свойств с публичными сеттерами, а вся логика в сервисах; инварианты никто не охраняет.
- **Домен зависит от EF/ASP.NET.** Атрибуты `[Key]`, `[Required]` в доменных классах и ссылки на пакеты инфраструктуры стирают границу. Конфигурацию маппинга держи в Infrastructure (Fluent API).
- **Один «универсальный» DTO для всех операций.** Для создания, обновления и ответа разные поля — разные типы.
- **Слои ради слоёв.** Четыре проекта и три маппинга на CRUD из двух таблиц — перебор; наращивай структуру по мере сложности.
- **Репозиторий с `IQueryable` наружу.** Детали EF протекают в Application и Api.
- **Исключения для обычного потока.** Домен бросает `DomainException` на нарушение правила — это нормально; но не используй исключения для «пользователь не найден» в горячих путях без нужды (подробнее — тема про ошибки).
- **Ручной маппинг в десятке мест.** Собери его в расширения/статические методы, а не копируй.
- **Циклические ссылки между проектами.** `dotnet` их не допустит; если их хочется — граница проведена неверно.

## Вопросы с собеседований

:::spoiler Почему Domain не должен зависеть от EF Core?
Бизнес-правила не должны меняться из-за смены технологии хранения, и их должно быть можно тестировать без базы. Зависимость от EF тянет инфраструктурные детали в самое стабильное место системы.
:::

:::spoiler Что такое overposting и как DTO от него защищает?
Клиент присылает поля, которые не должен менять (статус, владелец, роль), и привязка модели записывает их в сущность. DTO запроса содержит только разрешённые поля — остальным просто некуда попасть.
:::

:::spoiler Где проверяется правило «нельзя закрыть задачу без исполнителя»?
В доменной сущности (`TaskItem.Complete`): это инвариант предметной области, он должен соблюдаться независимо от того, кто вызывает метод — API, фоновая задача или тест.
:::

:::spoiler Расскажи архитектуру своего проекта
Четыре слоя: Api (эндпоинты, DTO, `Program.cs`), Application (сценарии, интерфейсы репозиториев), Domain (сущности и правила, без зависимостей), Infrastructure (EF Core, реализации). Зависимости направлены к домену; интерфейсы объявлены там, где нужны, реализации — снаружи; `Program.cs` связывает их через DI.
:::

:::spoiler Зачем интерфейсы вроде `ITaskRepository` лежат в Application, а не в Infrastructure? (ловушка: «потому что так принято»)
Инверсия зависимостей: высокоуровневый слой (сценарии) определяет, что ему нужно, а низкоуровневый (инфраструктура) подстраивается под это. Тогда Application не зависит от EF Core и тестируется на заглушках.
:::

:::spoiler Ручной маппинг или AutoMapper?
Для небольших проектов — ручной: явный, проверяется компилятором, прост в отладке. Библиотеки сокращают код на больших моделях, но прячут ошибки до рантайма; их нужно знать, потому что они часто встречаются в существующих проектах.
:::

:::spoiler Нужен ли отдельный слой Application для простого CRUD?
Не обязательно. Для чтения без правил можно проецировать из `DbContext` прямо в эндпоинте; слой нужен там, где есть сценарии с правилами и несколькими шагами.
:::

:::spoiler Чем доменное исключение отличается от HTTP-ошибки?
Домен бросает исключение, описывающее нарушение правила (`ConflictException`), и ничего не знает о кодах ответа. Слой Api превращает его в `409`/`404`/`400` в одном месте.
:::

## Что запомнить

- Слои: Api → Application → Domain; Infrastructure реализует интерфейсы Application. Зависимости направлены внутрь, к домену.
- Границы слоёв закрепляй ссылками проектов: компилятор не даст их нарушить.
- Бизнес-правила — в сущностях (`private set` + методы-действия); сервисы оркестрируют, не дублируют правила.
- Наружу и внутрь API — только DTO: защита от overposting, утечек и циклов, стабильный контракт.
- Интерфейсы объявляются там, где нужны; реализации — снаружи; связывает их `Program.cs`.
- Маппинг лучше явный; при чтении из EF проецируй сразу в DTO.
- Слои добавляй по мере роста сложности, а не «на всякий случай»; сценарий проверяется тестом без базы и HTTP.

## Практика

- [ ] Создал решение из 4 проектов с правильными ссылками
- [ ] Перенёс бизнес-правила своего проекта в методы сущностей (минимум 3 правила)
- [ ] Ввёл DTO для всех запросов и ответов; ни один эндпоинт не принимает и не возвращает сущность
- [ ] Нарисовал схему слоёв своего проекта для README

@@page id="p4-validation" phase="4" kind="topic" title="Валидация: DataAnnotations и FluentValidation" nav="Валидация" est="4–5 дней"
:::why
Каждый вход в API — потенциально мусор: пустые строки, отрицательные числа, даты из прошлого, строки на мегабайт. Валидация на границе даёт клиенту понятную ошибку `400` с указанием поля, а не `500` из глубины базы.
:::

## Зачем это нужно

Всё, что приходит из сети, нельзя считать корректным. Клиентов пишут люди (и атакующие): они присылают пустые поля, строки на мегабайт, даты в прошлом, отрицательные количества, JSON не той формы. Если ничего не проверять, эти данные доезжают до глубин приложения и ломаются там — обычно в самом неудобном месте:

- `500 Internal Server Error` из базы, потому что строка длиннее столбца;
- молчаливая запись мусора («пустое имя», «возраст −5»), которую потом приходится чистить руками;
- уязвимость: слишком длинная строка исчерпывает память, а вставленные в поле данные превращаются в проблему для следующего потребителя.

Валидация на границе API решает три задачи сразу. **Клиенту** она сообщает, что именно не так («поле `email` — не адрес почты»), и он может исправить ввод. **Серверу** она гарантирует, что в сценарии попадают только данные нужной формы. **Команде** она даёт единое место, где описаны ограничения, а не десятки проверок, размазанных по коду.

Но «валидация» — слово с двойным смыслом, и именно путаница между двумя её видами — главный источник вопросов на собеседовании: «чем валидация отличается от бизнес-правил?», «какой код вернуть при невалидных данных, а какой при конфликте?», «почему проверки уникальности в валидаторе недостаточно?», «DataAnnotations или FluentValidation?». Ниже мы разберём всё на работающих примерах — включая гонку с двойной регистрацией и настоящую ошибку уникального индекса в PostgreSQL.

## Интуиция и аналогия

**Контроль на входе в здание.** Охранник проверяет форму: пропуск есть, фото похоже, рюкзак не больше разрешённого. Он ничего не знает о том, что происходит внутри. Это валидация входа: быстрая, без обращения к состоянию системы. А вот решение «в переговорную 3 уже кто-то зашёл, подождите» принимает администратор этажа, глядя в расписание. Это бизнес-правило: зависит от текущего состояния.

**Таможенная декларация.** Форма заполнена не по правилам (пустое поле «фамилия») — бланк возвращают сразу: «исправьте и приходите снова» (`400`). А если форма заполнена идеально, но такой посылки уже оформляли — «конфликт с имеющимся» (`409`).

**Два человека у одного окошка.** Оба спрашивают «есть ли свободное место 12А?» — «есть». Оба говорят «беру». Одна из заявок должна провалиться, но проверка «есть ли место» этого не гарантирует; гарантирует только то, что система *физически не позволит* продать одно место дважды (уникальное ограничение).

## Основная теория по шагам

### Шаг 1. Два вида проверок

| | Валидация входа | Бизнес-правила |
|---|---|---|
| Что проверяет | форму данных: обязательность, длина, формат, диапазон | состояние системы: «задача уже закрыта», «email занят» |
| Где | на границе (API / Application) | в домене и сервисах |
| Нужна ли база | нет | часто да |
| Ответ | `400 Bad Request` + список полей | `409 Conflict` / `422` / `404` |

Валидация входа должна быть *дешёвой*: без обращений к базе, быстрой, с понятными сообщениями. Бизнес-правила — отдельная ответственность (см. [слои](#p4-architecture)): их проверяет домен независимо от того, кто его вызвал.

### Шаг 2. DataAnnotations — для простых случаев

~~~csharp @nocheck
using System.ComponentModel.DataAnnotations;

public sealed record RegisterRequest(
    [Required, EmailAddress, StringLength(200)] string Email,
    [Required, StringLength(100, MinimumLength = 8)] string Password,
    [Required, StringLength(100)] string DisplayName);
~~~

Атрибуты ставятся прямо на свойства (у записей — на параметры конструктора). С `[ApiController]` невалидная модель автоматически даёт `400` в формате ProblemDetails ещё до вызова метода контроллера:

~~~json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.5.1",
  "title": "One or more validation errors occurred.",
  "status": 400,
  "errors": { "Title": [ "The Title field is required." ] }
}
~~~

Для minimal API в .NET 10 появилась встроенная поддержка тех же атрибутов: достаточно `builder.Services.AddValidation()`. Проверим оба стиля на одном и том же типе запроса — на настоящем сервере:

~~~csharp
using System.ComponentModel.DataAnnotations;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc;

var builder = WebApplication.CreateBuilder();
builder.WebHost.UseUrls("http://127.0.0.1:0");
builder.Logging.ClearProviders();
builder.Services.AddControllers();
builder.Services.AddValidation();                         // проверка DataAnnotations в minimal API (.NET 10)
var app = builder.Build();
app.MapControllers();
app.MapPost("/minimal/register", (RegisterRequest r) => Results.Ok(new { ok = true, r.Email }));

await app.StartAsync();
using var http = new HttpClient { BaseAddress = new Uri(app.Urls.First()) };

async Task Show(string label, string url, object body)
{
    var r = await http.PostAsJsonAsync(url, body);
    var text = await r.Content.ReadAsStringAsync();
    if ((int)r.StatusCode == 400)
    {
        var j = JsonDocument.Parse(text).RootElement;
        var errors = j.GetProperty("errors").EnumerateObject()
            .Select(p => $"{p.Name}: {string.Join("; ", p.Value.EnumerateArray().Select(x => x.GetString()))}");
        Console.WriteLine($"{label} → 400 | {string.Join(" | ", errors)}");
    }
    else Console.WriteLine($"{label} → {(int)r.StatusCode} {text}");
}

var bad = new { email = "не-почта", password = "123", displayName = "" };
var good = new { email = "valera@example.org", password = "длинный-пароль", displayName = "Валера" };
await Show("контроллер, плохой   ", "/api/auth/register", bad);
await Show("контроллер, хороший  ", "/api/auth/register", good);
await Show("minimal API, плохой  ", "/minimal/register", bad);
await Show("minimal API, хороший ", "/minimal/register", good);
await app.StopAsync();

[ApiController]
[Route("api/auth")]
public class AuthController : ControllerBase
{
    [HttpPost("register")]
    public IActionResult Register(RegisterRequest request) => Ok(new { ok = true, request.Email });
}

public sealed record RegisterRequest(
    [Required, EmailAddress, StringLength(200)] string Email,
    [Required, StringLength(100, MinimumLength = 8)] string Password,
    [Required, StringLength(100)] string DisplayName);
~~~
~~~console
контроллер, плохой    → 400 | Email: The Email field is not a valid e-mail address. | Password: The field Password must be a string with a minimum length of 8 and a maximum length of 100. | DisplayName: The DisplayName field is required.
контроллер, хороший   → 200 {"ok":true,"email":"valera@example.org"}
minimal API, плохой   → 400 | Email: The Email field is not a valid e-mail address. | Password: The field Password must be a string with a minimum length of 8 and a maximum length of 100. | DisplayName: The DisplayName field is required.
minimal API, хороший  → 200 {"ok":true,"email":"valera@example.org"}
~~~

Оба стиля вернули `400` со списком полей и сообщениями — клиент получает все ошибки сразу, а не по одной. Без `AddValidation()` minimal API пропустил бы такой запрос без проверки (мы видели это в теме про [эндпоинты](#p4-endpoints)).

### Шаг 3. Когда атрибутов мало: своя проверка и FluentValidation

DataAnnotations отлично справляются с «обязательно», «длина», «диапазон», «формат». Но правила вроде «срок не раньше сегодняшней даты», «не больше 10 тегов, каждый до 30 символов», «если выбрана доставка — нужен адрес» в атрибутах выражаются неудобно. Для них есть два пути: интерфейс `IValidatableObject` (метод `Validate` внутри самого типа) либо библиотека **FluentValidation**, где правила описываются отдельным классом-валидатором:

~~~bash
dotnet add package FluentValidation.DependencyInjectionExtensions
~~~

~~~csharp @nocheck
using FluentValidation;

public sealed record CreateTaskRequest(string Title, string? Description, DateOnly? DueDate, int? AssigneeId, string[] Tags);

public sealed class CreateTaskRequestValidator : AbstractValidator<CreateTaskRequest>
{
    public CreateTaskRequestValidator(TimeProvider time)
    {
        RuleFor(x => x.Title)
            .NotEmpty().WithMessage("Название обязательно")
            .MaximumLength(200);

        RuleFor(x => x.Description).MaximumLength(5000);

        RuleFor(x => x.DueDate)
            .Must(d => d is null || d >= DateOnly.FromDateTime(time.GetUtcNow().UtcDateTime))
            .WithMessage("Срок не может быть в прошлом");

        RuleFor(x => x.AssigneeId).GreaterThan(0).When(x => x.AssigneeId is not null);

        RuleFor(x => x.Tags).Must(t => t.Length <= 10).WithMessage("Не больше 10 тегов");
        RuleForEach(x => x.Tags).NotEmpty().MaximumLength(30);
    }
}
~~~

~~~csharp Регистрация и вызов в minimal API @nocheck
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddValidatorsFromAssemblyContaining<CreateTaskRequestValidator>();

app.MapPost("/api/projects/{projectId:int}/tasks", async (
    int projectId, CreateTaskRequest request,
    IValidator<CreateTaskRequest> validator, TaskService service, CancellationToken ct) =>
{
    var result = await validator.ValidateAsync(request, ct);
    if (!result.IsValid)
        return Results.ValidationProblem(result.ToDictionary());      // тот же формат ProblemDetails

    var created = await service.CreateAsync(projectId, request, ct);
    return Results.Created($"/api/tasks/{created.Id}", created);
});
~~~

FluentValidation — сторонний пакет, и в нашей среде без доступа к NuGet его не подключить; но **механизм** можно показать без библиотеки. Ниже — собственный минимальный валидатор и **endpoint filter**, который выносит повторяющиеся три строки из каждого эндпоинта в одно место. Заметь важное: валидатор получает время через `TimeProvider` — поэтому правило «срок не в прошлом» проверяется детерминированно:

~~~csharp
using System.Net.Http.Json;
using System.Text.Json;

var builder = WebApplication.CreateBuilder();
builder.WebHost.UseUrls("http://127.0.0.1:0");
builder.Logging.ClearProviders();
builder.Services.AddSingleton<TimeProvider>(new FixedTime(new DateTimeOffset(2026, 10, 28, 12, 0, 0, TimeSpan.Zero)));
builder.Services.AddSingleton<IValidator<CreateTaskRequest>, CreateTaskRequestValidator>();
var app = builder.Build();

app.MapPost("/api/tasks", (CreateTaskRequest request) => Results.Created("/api/tasks/1", new { id = 1, request.Title }))
   .AddEndpointFilter<ValidationFilter<CreateTaskRequest>>();           // ← проверка вынесена из обработчика

await app.StartAsync();
using var http = new HttpClient { BaseAddress = new Uri(app.Urls.First()) };

async Task Show(string label, object body)
{
    var r = await http.PostAsJsonAsync("/api/tasks", body);
    var text = await r.Content.ReadAsStringAsync();
    if ((int)r.StatusCode == 400)
    {
        var errors = JsonDocument.Parse(text).RootElement.GetProperty("errors").EnumerateObject()
            .Select(p => $"{p.Name}: {string.Join("; ", p.Value.EnumerateArray().Select(x => x.GetString()))}");
        Console.WriteLine($"{label} → 400 | {string.Join(" | ", errors)}");
    }
    else Console.WriteLine($"{label} → {(int)r.StatusCode} {text}");
}

await Show("пустое название      ", new { title = "", tags = Array.Empty<string>() });
await Show("срок в прошлом       ", new { title = "Тесты", dueDate = "2026-10-01", tags = Array.Empty<string>() });
await Show("слишком много тегов  ", new { title = "Тесты", tags = Enumerable.Range(1, 11).Select(i => "t" + i).ToArray() });
await Show("несколько ошибок     ", new { title = "", dueDate = "2020-01-01", assigneeId = 0, tags = new[] { "" } });
await Show("всё в порядке        ", new { title = "Тесты", dueDate = "2026-11-01", tags = new[] { "api" } });
await app.StopAsync();

public sealed record CreateTaskRequest(string Title, DateOnly? DueDate, int? AssigneeId, string[] Tags);

public interface IValidator<T> { Dictionary<string, string[]> Validate(T value); }

public sealed class CreateTaskRequestValidator(TimeProvider time) : IValidator<CreateTaskRequest>
{
    public Dictionary<string, string[]> Validate(CreateTaskRequest x)
    {
        var errors = new Dictionary<string, List<string>>();
        void Add(string field, string message) { if (!errors.TryGetValue(field, out var l)) errors[field] = l = new(); l.Add(message); }

        if (string.IsNullOrWhiteSpace(x.Title)) Add("title", "Название обязательно");
        else if (x.Title.Length > 200) Add("title", "Название длиннее 200 символов");
        if (x.DueDate is { } d && d < DateOnly.FromDateTime(time.GetUtcNow().UtcDateTime)) Add("dueDate", "Срок не может быть в прошлом");
        if (x.AssigneeId is <= 0) Add("assigneeId", "Идентификатор исполнителя должен быть больше нуля");
        if (x.Tags.Length > 10) Add("tags", "Не больше 10 тегов");
        for (var i = 0; i < x.Tags.Length; i++)
            if (string.IsNullOrEmpty(x.Tags[i]) || x.Tags[i].Length > 30) Add($"tags[{i}]", "Тег — от 1 до 30 символов");

        return errors.ToDictionary(p => p.Key, p => p.Value.ToArray());
    }
}

// «endpoint filter»: выполняется вокруг обработчика, до него; может остановить запрос и вернуть 400
public sealed class ValidationFilter<T>(IValidator<T> validator) : IEndpointFilter
{
    public async ValueTask<object?> InvokeAsync(EndpointFilterInvocationContext context, EndpointFilterDelegate next)
    {
        var model = context.Arguments.OfType<T>().First();
        var errors = validator.Validate(model);
        return errors.Count > 0 ? Results.ValidationProblem(errors) : await next(context);
    }
}

public sealed class FixedTime(DateTimeOffset now) : TimeProvider { public override DateTimeOffset GetUtcNow() => now; }
~~~
~~~console
пустое название       → 400 | title: Название обязательно
срок в прошлом        → 400 | dueDate: Срок не может быть в прошлом
слишком много тегов   → 400 | tags: Не больше 10 тегов
несколько ошибок      → 400 | title: Название обязательно | dueDate: Срок не может быть в прошлом | assigneeId: Идентификатор исполнителя должен быть больше нуля | tags[0]: Тег — от 1 до 30 символов
всё в порядке         → 201 {"id":1,"title":"Тесты"}
~~~

Обрати внимание на три вещи. Все ошибки собираются разом (четвёртый запрос), а не «по одной за раз». Обработчик эндпоинта остался коротким — вся проверка вынесена в фильтр. И правило про «прошлое» не зависит от настоящих часов: время внедряется (`TimeProvider`), поэтому правило можно проверять детерминированно.

### Шаг 4. Валидация — это не уникальность

:::warn Не делай запросов к базе в валидаторе «на всякий случай»
Проверка «email уже занят» в валидаторе выглядит удобно, но не защищает от гонки: два запроса одновременно пройдут проверку. Уникальность гарантирует **уникальный индекс** в базе, а сервис превращает ошибку базы в `409`.
:::

Воспроизведём гонку. «Таблица» — список адресов; наивная регистрация сначала проверяет, что адрес свободен, затем «ходит в базу» 100 мс и добавляет. Две параллельные регистрации одного адреса:

~~~csharp
using System.Net.Http.Json;

var builder = WebApplication.CreateBuilder();
builder.WebHost.UseUrls("http://127.0.0.1:0");
builder.Logging.ClearProviders();
var app = builder.Build();

var naiveTable = new List<string>();
var constrainedTable = new HashSet<string>();            // уникальный индекс: повторную вставку не принимает
var gate = new object();

// ❌ «проверить, затем вставить»: между проверкой и вставкой — окно для гонки
app.MapPost("/naive", async (Reg r) =>
{
    bool exists; lock (gate) exists = naiveTable.Contains(r.Email);
    if (exists) return Results.Conflict();
    await Task.Delay(100);                                // «поход в базу»
    lock (gate) naiveTable.Add(r.Email);
    return Results.Created("/users/1", r);
});

// ✅ ограничение уникальности: вставка атомарна, дубль отвергается, а сервис отвечает 409
app.MapPost("/unique", async (Reg r) =>
{
    await Task.Delay(100);
    bool inserted; lock (gate) inserted = constrainedTable.Add(r.Email);
    return inserted ? Results.Created("/users/1", r) : Results.Conflict();
});

await app.StartAsync();
using var http = new HttpClient { BaseAddress = new Uri(app.Urls.First()) };

foreach (var url in new[] { "/naive", "/unique" })
{
    var calls = await Task.WhenAll(http.PostAsJsonAsync(url, new Reg("same@example.org")), http.PostAsJsonAsync(url, new Reg("same@example.org")));
    Console.WriteLine($"{url,-8} коды ответов: {string.Join(", ", calls.Select(c => (int)c.StatusCode).Order())}");
}
Console.WriteLine($"в «таблице» без ограничения: {naiveTable.Count} запись(ей) с одним email; с ограничением: {constrainedTable.Count}");
await app.StopAsync();

record Reg(string Email);
~~~
~~~console
/naive   коды ответов: 201, 201
/unique  коды ответов: 201, 409
в «таблице» без ограничения: 2 запись(ей) с одним email; с ограничением: 1
~~~

Наивная версия создала двух пользователей с одним адресом — обе проверки прошли до того, как кто-то вставил строку. Версия с ограничением корректно отвергла дубль. В реальной базе роль «ограничения» играет уникальный индекс. Вот как это выглядит в PostgreSQL (в таблице читателей уникален номер карточки):

~~~sql Уникальный индекс не даёт вставить дубль
INSERT INTO "Readers" ("FullName", "CardNumber", "Type") VALUES ('Дубль', 'R-001', 'Student');
~~~
~~~console
ERROR:  duplicate key value violates unique constraint "IX_Readers_CardNumber"
DETAIL:  Key ("CardNumber")=(R-001) already exists.
~~~

Эту ошибку (код PostgreSQL `23505`, «нарушение уникальности») сервисный слой перехватывает и превращает в понятный `409 Conflict`. Валидатор при этом всё равно полезен — для *удобного* раннего сообщения в обычном случае, — но последнюю линию обороны держит база.

## Как это работает под капотом

- **Где срабатывает проверка.** Для контроллеров с `[ApiController]` — фильтр модели: после привязки параметров, до вызова действия. Для minimal API с `AddValidation()` — проверка встроена в конвейер привязки параметров. Для FluentValidation (и нашего примера) — вручную или фильтром. Во всех случаях запрос с ошибками не доходит до сервиса.
- **Формат ответа.** `Results.ValidationProblem(errors)` и автоматический ответ MVC дают один и тот же формат `application/problem+json` со словарём `errors` (поле → список сообщений) — стандарт, который понимают клиентские библиотеки. Единый формат ошибок для всего API — тема про [ошибки](#p4-errors).
- **Как работают атрибуты.** `[Required]`, `[StringLength]` — это атрибуты ([рефлексия метаданных](#/ref/c/cl-attributes)); валидатор собирает их у типа через рефлексию (в .NET 10 для minimal API — через сгенерированный при компиляции код), вызывает у каждого `IsValid` и собирает сообщения. Так что DataAnnotations — не «магия фреймворка», а обычный обход метаданных.
- **`IEndpointFilter`** — аналог middleware, но на уровне одного эндпоинта: получает аргументы обработчика и `next`; может вернуть результат вместо вызова обработчика (короткое замыкание, как в [middleware](#p4-middleware)).
- **Пакетирование ошибок.** Хороший валидатор не останавливается на первой ошибке и собирает все: клиенту (и пользователю формы) не приходится исправлять по одной.
- **Вложенные объекты и коллекции.** DataAnnotations проверяют вложенные типы только при явной поддержке (в MVC и `AddValidation()` — рекурсивно); FluentValidation — через `RuleForEach`/`SetValidator`. Ограничивай размеры коллекций и длины строк везде: это ещё и защита от злоупотреблений.
- **Локализация сообщений.** Стандартные сообщения DataAnnotations английские; свои задаются `ErrorMessage = "..."` или ресурсами. Публичное API часто отдаёт машинные коды ошибок, а текст формирует клиент.
- **Валидация не заменяет ограничения БД.** `NOT NULL`, `CHECK`, `UNIQUE`, `FOREIGN KEY` — последний рубеж на случай, если проверку обошли (другой клиент, миграция, ручной скрипт).

## Типичные ошибки и ловушки

- **Нет валидации вообще.** Мусор доезжает до базы; клиент получает `500`.
- **Проверки только на клиенте.** Браузерную проверку обходят одной командой `curl`.
- **Уникальность в валидаторе.** Гонка: два запроса пройдут проверку; нужен уникальный индекс и обработка ошибки → `409`.
- **Путаница `400` и `409`/`422`.** Форма данных неверна — `400`; состояние не позволяет — `409` (или `422` по договорённости).
- **Валидация, которая ходит в базу в каждом правиле.** Медленно, ненадёжно, смешивает уровни.
- **Остановка на первой ошибке.** Пользователь исправляет поля по одному, получая новый `400` каждый раз.
- **Нет ограничений на размеры.** Строка в 100 МБ или коллекция из миллиона элементов исчерпывают память.
- **Доверие значению из другого слоя.** Проверил в контроллере, а сервис вызывается ещё и из фоновой задачи: инварианты домена всё равно должны охраняться в самом домене.
- **Разные форматы ошибок у разных эндпоинтов.** Используй `ValidationProblem` / ProblemDetails везде.
- **Текущее время напрямую (`DateTime.Now`) в правилах.** Правило невозможно проверить тестом; внедряй `TimeProvider`.
- **Сообщения с внутренними деталями.** «Column Email of table users…» — клиенту нужен смысл, а не устройство базы.
- **`[Required]` на значимом типе (`int`, `DateOnly`).** Значение по умолчанию (`0`, `0001-01-01`) — не `null`, и атрибут всегда считает его заполненным. Чтобы отличить «не прислали» от «прислали ноль», сделай тип необязательным (`int?`) и повесь `[Required]` на него.

## Вопросы с собеседований

:::spoiler Чем валидация входа отличается от бизнес-правила? Приведи по примеру
Валидация — форма данных без знания о состоянии системы: «название не пустое и до 200 символов» → 400. Бизнес-правило — зависит от состояния: «нельзя закрыть уже закрытую задачу» → 409.
:::

:::spoiler Почему проверки «email уже занят» в валидаторе недостаточно?
Между проверкой и вставкой другой запрос может вставить тот же email. Только уникальное ограничение в базе гарантирует уникальность.
:::

:::spoiler DataAnnotations или FluentValidation? (ловушка: «FluentValidation всегда лучше»)
Атрибуты — для простых декларативных ограничений, они встроены в фреймворк. FluentValidation — для сложных, условных и зависящих от контекста правил, с тестируемыми валидаторами. Они не взаимоисключающие; выбирай по сложности правил и привычкам команды.
:::

:::spoiler Какой код вернуть при невалидных данных и в каком формате?
`400 Bad Request` с телом ProblemDetails (`application/problem+json`) и словарём `errors` «поле → сообщения».
:::

:::spoiler Что такое `IEndpointFilter` и зачем он?
Фильтр вокруг одного эндпоинта minimal API: получает аргументы и `next`, может остановить запрос. Используется для повторяющейся логики — например, валидации входа, — чтобы не дублировать её в каждом обработчике.
:::

:::spoiler Зачем внедрять `TimeProvider`, а не звать `DateTime.Now` в правилах?
Правило, зависящее от текущего времени, нельзя проверить детерминированно. `TimeProvider` подменяется заглушкой с фиксированным временем в тестах.
:::

:::spoiler Достаточно ли валидации в API, если в базе есть ограничения?
Нужны оба: валидация даёт быстрые понятные ошибки на границе, ограничения базы — последний рубеж, который нельзя обойти. Ошибка базы (например, нарушение уникальности) превращается в `409`, а не в `500`.
:::

:::spoiler Как переехать с «ручных» проверок в контроллере на единообразные?
Вынести правила в атрибуты/валидаторы, включить автоматический ответ `400` (`[ApiController]`/`AddValidation`) либо фильтр, возвращающий `ValidationProblem`, и убедиться, что формат ошибок один для всего API.
:::

## Что запомнить

- Два вида проверок: валидация входа (форма данных, `400`) и бизнес-правила (состояние, `409`/`422`/`404`).
- Простые ограничения — DataAnnotations; сложные и зависящие от контекста — отдельные валидаторы (FluentValidation).
- Собирай все ошибки сразу и отдавай одним форматом — `ProblemDetails` с `errors`.
- Повторяющуюся проверку выноси в фильтр (`IEndpointFilter`/action filter), а не копируй в обработчики.
- Уникальность гарантирует индекс в базе; сервис превращает ошибку базы в `409`.
- Ограничивай размеры строк и коллекций; время внедряй через `TimeProvider`.
- Валидация — первый рубеж, ограничения БД — последний: нужны оба.

:::info FluentValidation
Документация библиотеки — на её сайте (docs.fluentvalidation.net), это сторонний проект, не Microsoft.
:::

## Практика

- [ ] Добавил валидаторы для всех входных DTO проекта
- [ ] Вынес вызов валидации в endpoint/action filter
- [ ] Проверил `.http`-файлом 10 некорректных запросов: каждый даёт `400` с понятным полем и сообщением
- [ ] Реализовал «email занят» через уникальный индекс + перехват ошибки базы → `409`

@@page id="p4-errors" phase="4" kind="topic" title="Ошибки и логирование: ProblemDetails, глобальный обработчик, Serilog" nav="Ошибки и логирование" est="~1 неделя"
:::why
Ошибки бывают всегда. Разница между любительским и профессиональным API в том, что ошибка **предсказуема для клиента** (один формат, правильный код) и **расследуема для разработчика** (в логе есть что, где, с какими данными). Централизованная обработка ещё и убирает `try/catch` из каждого эндпоинта.
:::

## Зачем это нужно

Представь два API. Первое при ошибке иногда отвечает `200` с текстом «что-то пошло не так», иногда — `500` со стеком вызовов на всю страницу, иногда — `400` с английской фразой в произвольном формате. Фронтенд-разработчик пишет к нему десять разных разборщиков и всё равно ловит неожиданности; администратор, увидев жалобу «не работает», не может понять, что именно произошло.

Второе при любой ошибке отдаёт один и тот же формат: правильный статус, короткий заголовок, понятное описание и идентификатор запроса `traceId`. А в логах по этому идентификатору находится всё остальное: какой пользователь, какой запрос, какое исключение и где. Разница между ними — не «умение программировать», а дисциплина обработки ошибок и логирования.

Что это даёт на практике:

- **Клиенту** — предсказуемость: один формат (`ProblemDetails`), по статусу ясно, что делать (исправить запрос, повторить позже, обратиться в поддержку).
- **Разработчику** — расследуемость: по `traceId` из ответа в логах находится причина.
- **Безопасности** — отсутствие утечек: пользователь не видит ни стек, ни текст SQL, ни пути на сервере.
- **Коду** — чистота: `try/catch` не рассыпаны по эндпоинтам, домен просто бросает исключение, а одно место превращает его в ответ.

Тема входит в обязательный минимум для Junior .NET: «как у вас устроена обработка ошибок?», «что такое ProblemDetails?», «что такое структурированное логирование и чем оно лучше обычного?», «какие бывают уровни логов?». Ниже ты увидишь это на работающем сервере и проверишь каждое утверждение запуском.

## Интуиция и аналогия

**Служба поддержки с единым бланком обращения.** Любая жалоба (клиент не нашёл товар, товар не подошёл, сломалась касса) оформляется на одном бланке: категория, краткое название, подробности, номер обращения. Клиент всегда знает, как читать ответ. А внутри компании по номеру обращения находится подробная запись: кто, когда, что делал. Номер обращения — это `traceId`.

**Чёрный ящик самолёта.** Пассажирам не нужно знать подробности неисправности (и тем более их нельзя раскрывать злоумышленнику); им говорят «возникла неполадка». Но все параметры полёта записываются в «чёрный ящик» — логи. Хороший журнал — не тот, в который пишут больше всего, а тот, в котором *можно найти нужное*: поэтому записи структурированные, с полями.

**Предохранитель в щитке.** Любая неисправность в квартире не должна приводить к пожару. Глобальный обработчик — предохранитель в начале цепи: что бы ни случилось внутри, наружу выходит безопасный стандартный ответ.

## Основная теория по шагам

### Шаг 1. Что такое ProblemDetails

`ProblemDetails` — стандартный формат (RFC 9457, ранее 7807) описания ошибок HTTP-API с типом `application/problem+json`. Поля: `type` (ссылка на описание вида ошибки), `title` (короткий заголовок), `status` (код), `detail` (подробности для человека), `instance` (адрес запроса) и произвольные расширения вроде `traceId` или `errors`. ASP.NET Core умеет формировать такие ответы сам, если зарегистрировать `AddProblemDetails()`.

### Шаг 2. Глобальный обработчик: доменные исключения → HTTP-коды

Домен бросает исключения своих типов (см. [слои](#p4-architecture)), а слой Api превращает их в ответы **в одном месте**:

~~~csharp Infrastructure/DomainExceptionHandler.cs @nocheck
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Mvc;

public sealed class DomainExceptionHandler(IProblemDetailsService problemDetails, ILogger<DomainExceptionHandler> logger)
    : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(HttpContext http, Exception exception, CancellationToken ct)
    {
        var (status, title) = exception switch
        {
            NotFoundException => (StatusCodes.Status404NotFound, "Не найдено"),
            ConflictException => (StatusCodes.Status409Conflict, "Конфликт"),
            ForbiddenException => (StatusCodes.Status403Forbidden, "Нет доступа"),
            DomainException   => (StatusCodes.Status422UnprocessableEntity, "Нарушено бизнес-правило"),
            _ => (0, "")
        };
        if (status == 0) return false;                       // не наше — пусть обработает стандартный обработчик (500)

        logger.LogWarning("Доменная ошибка {Type}: {Message}", exception.GetType().Name, exception.Message);
        http.Response.StatusCode = status;
        return await problemDetails.TryWriteAsync(new ProblemDetailsContext
        {
            HttpContext = http,
            ProblemDetails = new ProblemDetails { Status = status, Title = title, Detail = exception.Message },
            Exception = exception,
        });
    }
}
~~~

~~~csharp Program.cs @nocheck
builder.Services.AddProblemDetails();                               // единый формат ошибок
builder.Services.AddExceptionHandler<DomainExceptionHandler>();

var app = builder.Build();
app.UseExceptionHandler();                                          // самым первым в конвейере
app.UseStatusCodePages();                                           // ProblemDetails и для «пустых» 404/405
~~~

Теперь сервисы просто бросают `NotFoundException` или `ConflictException`, а клиент получает:

~~~json
{
  "title": "Конфликт",
  "status": 409,
  "detail": "Задача уже закрыта",
  "traceId": "00-6f1c...-01"
}
~~~

Всё остальное (`NullReferenceException`, ошибка базы) — это **баг**: стандартный обработчик вернёт `500` без деталей реализации, а полная информация уйдёт в лог.

Проверим всё это на работающем сервере. Эндпоинты специально бросают разные исключения; напечатаем статус, тип содержимого, заголовок и подробности ответа. Отдельно запросим несуществующий адрес и адрес с неверным методом — их тоже оформляет `UseStatusCodePages`:

~~~csharp
using System.Diagnostics;
using System.Text.Json;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Mvc;

var builder = WebApplication.CreateBuilder();
builder.WebHost.UseUrls("http://127.0.0.1:0");
builder.Logging.ClearProviders();
builder.Services.AddProblemDetails();
builder.Services.AddExceptionHandler<DomainExceptionHandler>();
var app = builder.Build();

app.UseExceptionHandler();
app.UseStatusCodePages();

app.MapGet("/notfound", () => { throw new NotFoundException("Задача 99 не найдена"); });
app.MapGet("/conflict", () => { throw new ConflictException("Задача уже закрыта"); });
app.MapGet("/rule", () => { throw new DomainException("Нельзя закрыть задачу без исполнителя"); });
app.MapGet("/bug", () => { string? s = null; return s!.Length; });             // настоящий баг
app.MapPost("/only-post", () => "ok");

await app.StartAsync();
using var http = new HttpClient { BaseAddress = new Uri(app.Urls.First()) };

foreach (var path in new[] { "/notfound", "/conflict", "/rule", "/bug", "/no-such-route", "/only-post" })
{
    var r = await http.GetAsync(path);
    var text = await r.Content.ReadAsStringAsync();
    var j = JsonDocument.Parse(text).RootElement;
    string Field(string name) => j.TryGetProperty(name, out var v) ? v.ToString() : "—";
    Console.WriteLine($"{path,-15} → {(int)r.StatusCode} {r.Content.Headers.ContentType?.MediaType} | title=«{Field("title")}» detail=«{Field("detail")}» traceId есть: {j.TryGetProperty("traceId", out _)}");
}

// traceId из ответа — тот самый, что записан в журнал: по нему находят запись
var conflict = await http.GetAsync("/conflict");
var traceId = JsonDocument.Parse(await conflict.Content.ReadAsStringAsync()).RootElement.GetProperty("traceId").GetString();
Console.WriteLine($"traceId из ответа найден в журнале: {DomainExceptionHandler.Logged.Contains(traceId!)}");
await app.StopAsync();

public class DomainException(string message) : Exception(message);
public sealed class ConflictException(string message) : DomainException(message);
public sealed class NotFoundException(string message) : DomainException(message);
public sealed class ForbiddenException(string message) : DomainException(message);

public sealed class DomainExceptionHandler(IProblemDetailsService problemDetails, ILogger<DomainExceptionHandler> logger) : IExceptionHandler
{
    public static readonly List<string> Logged = new();     // в реальности это файл/Seq/Elasticsearch

    public async ValueTask<bool> TryHandleAsync(HttpContext http, Exception exception, CancellationToken ct)
    {
        var (status, title) = exception switch
        {
            NotFoundException  => (StatusCodes.Status404NotFound, "Не найдено"),
            ConflictException  => (StatusCodes.Status409Conflict, "Конфликт"),
            ForbiddenException => (StatusCodes.Status403Forbidden, "Нет доступа"),
            DomainException    => (StatusCodes.Status422UnprocessableEntity, "Нарушено бизнес-правило"),
            _ => (0, "")
        };
        if (status == 0) return false;                       // не наше — пусть обработает стандартный обработчик (500)

        var traceId = Activity.Current?.Id ?? http.TraceIdentifier;
        Logged.Add(traceId);
        logger.LogWarning("Доменная ошибка {Type}: {Message} (trace {TraceId})", exception.GetType().Name, exception.Message, traceId);

        http.Response.StatusCode = status;
        return await problemDetails.TryWriteAsync(new ProblemDetailsContext
        {
            HttpContext = http,
            ProblemDetails = new ProblemDetails { Status = status, Title = title, Detail = exception.Message },
            Exception = exception,
        });
    }
}
~~~
~~~console
/notfound       → 404 application/problem+json | title=«Не найдено» detail=«Задача 99 не найдена» traceId есть: True
/conflict       → 409 application/problem+json | title=«Конфликт» detail=«Задача уже закрыта» traceId есть: True
/rule           → 422 application/problem+json | title=«Нарушено бизнес-правило» detail=«Нельзя закрыть задачу без исполнителя» traceId есть: True
/bug            → 500 application/problem+json | title=«An error occurred while processing your request.» detail=«—» traceId есть: True
/no-such-route  → 404 application/problem+json | title=«Not Found» detail=«—» traceId есть: True
/only-post      → 405 application/problem+json | title=«Method Not Allowed» detail=«—» traceId есть: True
traceId из ответа найден в журнале: True
~~~

Три важных наблюдения. Все ошибки — одного формата (`application/problem+json`) с корректным статусом, а `NullReferenceException` превратился в стандартный `500` **без деталей реализации**: клиент не видит ни `NullReferenceException`, ни стека. Даже «пустые» ответы вроде `404` и `405` получили тело в том же формате. И `traceId` из ответа совпадает с тем, что записано в журнал, — по нему разработчик найдёт подробности.

:::danger Стек вызовов в ответе на проде
Текст исключения и стек раскрывают устройство системы (пути, SQL, версии библиотек). Подробности — только в логах и только в Development в ответе.
:::

Порядок регистрации важен: если зарегистрировано несколько `IExceptionHandler`, они вызываются по очереди; тот, кто вернул `true`, «съедает» исключение, а `false` передаёт дальше. Если не подошёл никто — работает стандартная обработка с кодом `500`.

### Шаг 3. Логирование: структурированное, а не строки

~~~csharp @nocheck
public sealed class TaskService(ILogger<TaskService> logger /* , ... */)
{
    public void Complete(int taskId, int userId)
    {
        // ✅ шаблон сообщения: TaskId и UserId сохраняются как отдельные поля, по ним можно искать
        logger.LogInformation("Пользователь {UserId} закрыл задачу {TaskId}", userId, taskId);

        // ❌ интерполяция: в логе одна строка, искать «все действия пользователя 42» — только по тексту
        // logger.LogInformation($"Пользователь {userId} закрыл задачу {taskId}");
    }
}
~~~

Покажем разницу на деле. Свой крошечный приёмник логов (как Seq, Elasticsearch или консоль Serilog) получает от `ILogger` не только готовую строку, но и **поля**. Посмотрим, что именно:

~~~csharp
using Microsoft.Extensions.Logging;

var captured = new List<string>();
using var factory = LoggerFactory.Create(b => b.SetMinimumLevel(LogLevel.Information).AddProvider(new CaptureProvider(captured)));
var logger = factory.CreateLogger("Demo");

int userId = 42, taskId = 7;
logger.LogInformation("Пользователь {UserId} закрыл задачу {TaskId}", userId, taskId);      // ✅ шаблон
logger.LogInformation($"Пользователь {userId} закрыл задачу {taskId}");                      // ❌ интерполяция
logger.LogDebug("уровень Debug ниже минимального — запись отброшена");
Log.TaskClosed(logger, userId, taskId);                                                      // ✅ [LoggerMessage]
foreach (var line in captured) Console.WriteLine(line);

// цена интерполяции: строка собирается ДО вызова, даже если уровень выключен
var probe = new Probe();
logger.LogDebug("значение {V}", probe);
Console.WriteLine($"ToString вызван при шаблоне:      {Probe.Calls} раз");
logger.LogDebug($"значение {probe}");
Console.WriteLine($"ToString вызван при интерполяции: {Probe.Calls} раз");

sealed class Probe { public static int Calls; public override string ToString() { Calls++; return "значение"; } }

static partial class Log
{
    [LoggerMessage(Level = LogLevel.Information, Message = "Пользователь {UserId} закрыл задачу {TaskId}")]
    public static partial void TaskClosed(ILogger logger, int userId, int taskId);
}

sealed class CaptureProvider(List<string> sink) : ILoggerProvider
{
    public ILogger CreateLogger(string category) => new CaptureLogger(sink);
    public void Dispose() { }
}

sealed class CaptureLogger(List<string> sink) : ILogger
{
    public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;
    public bool IsEnabled(LogLevel level) => true;
    public void Log<TState>(LogLevel level, EventId id, TState state, Exception? ex, Func<TState, Exception?, string> formatter)
    {
        var fields = state is IEnumerable<KeyValuePair<string, object?>> kv
            ? string.Join(", ", kv.Select(p => $"{p.Key}={p.Value}")) : "";
        sink.Add($"[{level}] {formatter(state, ex)}\n      поля: {fields}");
    }
}
~~~
~~~console
[Information] Пользователь 42 закрыл задачу 7
      поля: UserId=42, TaskId=7, {OriginalFormat}=Пользователь {UserId} закрыл задачу {TaskId}
[Information] Пользователь 42 закрыл задачу 7
      поля: {OriginalFormat}=Пользователь 42 закрыл задачу 7
[Information] Пользователь 42 закрыл задачу 7
      поля: UserId=42, TaskId=7, {OriginalFormat}=Пользователь {UserId} закрыл задачу {TaskId}
ToString вызван при шаблоне:      0 раз
ToString вызван при интерполяции: 1 раз
~~~

Структурированный вызов передал приёмнику поля `UserId=42` и `TaskId=7` (плюс исходный шаблон), по которым можно искать и агрегировать: «все действия пользователя 42», «сколько задач закрыто за час». Интерполяция передала только готовую строку — искать придётся по тексту. Кроме того, шаблон при выключенном уровне вообще не форматируется (`ToString` не вызван), а интерполированная строка собирается всегда. Атрибут `[LoggerMessage]` (генератор кода) даёт тот же результат без лишних выделений памяти — его используют в горячих местах.

| Уровень | Когда |
|---|---|
| `Trace`/`Debug` | подробности для отладки, на проде выключены |
| `Information` | значимые бизнес-события: создан заказ, пользователь вошёл |
| `Warning` | необычное, но обработанное: ретрай, доменная ошибка, медленный запрос |
| `Error` | операция не удалась, нужна реакция |
| `Critical` | приложение не может работать |

Чего **не** писать в логи: пароли, токены, номера карт, полные персональные данные. Исключение логируют передачей объекта (`logger.LogError(ex, "Не удалось закрыть задачу {TaskId}", id)`), а не его текста: тогда сохраняется тип, сообщение и стек.

### Шаг 4. Serilog

~~~bash
dotnet add package Serilog.AspNetCore
~~~

~~~csharp Program.cs @nocheck
using Serilog;

builder.Host.UseSerilog((context, config) => config
    .ReadFrom.Configuration(context.Configuration)     // уровни и приёмники — из appsettings
    .Enrich.FromLogContext()
    .WriteTo.Console());

var app = builder.Build();
app.UseSerilogRequestLogging();                        // одна строка на запрос: метод, путь, статус, время
~~~

~~~json appsettings.json
{
  "Serilog": {
    "MinimumLevel": {
      "Default": "Information",
      "Override": { "Microsoft.AspNetCore": "Warning", "Microsoft.EntityFrameworkCore.Database.Command": "Warning" }
    }
  }
}
~~~

Serilog — стандарт де-факто в .NET-проектах: структурированные логи, много приёмников (консоль, файл, Seq, Elasticsearch). Встроенный `ILogger<T>` остаётся интерфейсом в коде — Serilog работает под ним. (Это сторонний пакет; в нашей среде без доступа к NuGet мы его не запускали — механизм «шаблон → поля → приёмник» продемонстрирован выше на встроенных средствах.)

### Шаг 5. Что видит клиент в разработке и в проде

Логично ожидать, что в `Development` ответ подробнее, чем в `Production`. Проверим, так ли это, когда стоит `UseExceptionHandler`: сравним ответ на баг в обоих окружениях.

~~~csharp
using System.Text.Json;

foreach (var env in new[] { "Production", "Development" })
{
    var builder = WebApplication.CreateBuilder(new WebApplicationOptions { EnvironmentName = env });
    builder.WebHost.UseUrls("http://127.0.0.1:0");
    builder.Logging.ClearProviders();
    builder.Services.AddProblemDetails();
    var app = builder.Build();
    app.UseExceptionHandler();
    app.MapGet("/bug", () => { string? s = null; return s!.Length; });

    await app.StartAsync();
    using var http = new HttpClient { BaseAddress = new Uri(app.Urls.First()) };
    var r = await http.GetAsync("/bug");
    var j = JsonDocument.Parse(await r.Content.ReadAsStringAsync()).RootElement;
    var keys = string.Join(", ", j.EnumerateObject().Select(p => p.Name));
    Console.WriteLine($"{env,-12} → {(int)r.StatusCode}, поля ответа: {keys}");
    Console.WriteLine($"{"",-12}   detail: {(j.TryGetProperty("detail", out var d) ? d.ToString() : "—")}");
    await app.StopAsync();
}
~~~
~~~console
Production   → 500, поля ответа: type, title, status, traceId
               detail: —
Development  → 500, поля ответа: type, title, status, traceId
               detail: —
~~~

Ответы **одинаковые**: `UseExceptionHandler` с `AddProblemDetails()` не показывает детали исключения ни в одном окружении, а заголовок `500` стандартный (на английском; при желании его переопределяют в `ProblemDetailsContext`). Подробный HTML со стеком в `Development` рисует другое middleware — страница разработчика (`UseDeveloperExceptionPage`, в `WebApplication` она подключается автоматически только в `Development` и только когда нет `UseExceptionHandler`). Вывод: если ты поставил свой обработчик, детали для клиента не утекут в обоих окружениях, а искать причину нужно в логах по `traceId`.

## Как это работает под капотом

- **Где ловятся исключения.** `UseExceptionHandler` — middleware, которое оборачивает остальной конвейер в `try/catch`. Поймав исключение, оно (при необходимости) очищает уже сформированный, но не отправленный ответ, выставляет статус и вызывает обработчики: сначала зарегистрированные `IExceptionHandler`, затем стандартную логику. Поэтому оно обязано стоять **первым** (см. [middleware](#p4-middleware)).
- **`IProblemDetailsService`** — сервис, который по `ProblemDetailsContext` находит подходящий писатель (`IProblemDetailsWriter`), дополняет ответ стандартными полями (`type`, `title`, `status`, `traceId`) и сериализует в `application/problem+json`. Через него идёт и `UseStatusCodePages`, и `Results.Problem`/`ValidationProblem`.
- **`traceId`.** Берётся из текущего `Activity` (идентификатор распределённой трассировки в формате W3C) или из `HttpContext.TraceIdentifier`. Тот же идентификатор попадает в область журнала, поэтому записи одного запроса можно найти разом.
- **Как работает `ILogger`.** `ILogger<T>` берётся из DI; вызовы идут в `ILoggerFactory`, который передаёт запись всем зарегистрированным провайдерам (консоль, отладчик, Serilog) после применения фильтров по категории и уровню. Категория — полное имя типа `T`, поэтому в конфигурации можно сказать «`Microsoft.AspNetCore` — только предупреждения».
- **Шаблоны сообщений.** Парсер шаблона `{UserId}` кэшируется; значения передаются провайдерам как пары «имя — значение». Чем стабильнее шаблон (одна и та же строка, а не новая на каждый вызов), тем лучше работают кэш и группировка записей по шаблону.
- **Фильтрация по уровню дешёвая.** Если уровень выключен, `IsEnabled` возвращает `false`, и форматирование не выполняется. Это не относится к интерполированной строке — её собирает код до вызова.
- **Исключения как поток управления — дорого.** Бросок и перехват исключения стоит на порядки дороже обычного `return`; для ожидаемых ситуаций «не найдено» в горячем пути стоит возвращать `null`/результат и превращать в `404` на границе, а исключения оставлять для действительно исключительных случаев (подробнее — [цена исключений](#/ref/d/fl-exception-cost)).
- **Что делает сервер, если ответ уже начался.** Если исключение возникло после отправки части тела, сменить статус нельзя: соединение обрывается. Поэтому ответ формируют целиком в конце обработки (как в `Results.*`), а не пишут кусками, где не нужно.
- **Асинхронные ошибки.** Необработанное исключение в `async`-обработчике попадает в то же `UseExceptionHandler`; потерянные «fire-and-forget» задачи — нет, они вне конвейера запроса (см. Фазу 5).

## Типичные ошибки и ловушки

- **`try/catch` с пустым `catch` или `catch (Exception)` в каждом эндпоинте.** Ошибки глотаются, формат ответов расходится.
- **`200 OK` с описанием ошибки в теле.** Статус — главный сигнал; см. тему про HTTP.
- **Стек или текст исключения в ответе на проде.** Утечка внутреннего устройства.
- **Логирование интерполяцией.** Нет полей для поиска; лишняя работа при выключенных уровнях.
- **Логирование чувствительных данных.** Пароли, токены, номера карт, полные персональные данные.
- **Логирование на `Error` ожидаемых ситуаций** (неверный пароль, «не найдено»): шум скрывает настоящие проблемы. Для таких — `Information`/`Warning`.
- **Потеря исключения:** `logger.LogError("Ошибка: " + ex.Message)` вместо `logger.LogError(ex, ...)` — пропадают тип и стек.
- **Обработчик исключений не первым в конвейере.** Ошибки внешних звеньев мимо него (мы видели в теме про [middleware](#p4-middleware)).
- **Разные форматы ошибок в разных частях API.** Используй `AddProblemDetails()` и `ValidationProblem` везде.
- **Логи без `traceId`.** Невозможно связать жалобу клиента с записью в журнале.
- **Слишком подробные логи на проде** (`Debug` для всех категорий): диск, деньги и шум; уровни настраивай по категориям.
- **`throw ex;` вместо `throw;`.** Сбрасывает стек исходного исключения (подробности — [повторный выброс](#/ref/d/fl-rethrow)).

## Вопросы с собеседований

:::spoiler Почему нельзя логировать через строковую интерполяцию?
Интерполяция превращает значения в текст до записи: поля `UserId`, `TaskId` теряются как структурированные данные, по ним нельзя фильтровать и агрегировать. Плюс строка собирается, даже если уровень логирования выключен.
:::

:::spoiler Что должен увидеть клиент при NullReferenceException в сервисе?
500 в формате ProblemDetails без деталей реализации (и с `traceId`, по которому разработчик найдёт полную ошибку в логах).
:::

:::spoiler Зачем `IExceptionHandler`, если можно поставить try/catch в каждом эндпоинте?
Одно место с правилами сопоставления «исключение → код», единый формат ответа, никакого дублирования и невозможность забыть обработку в новом эндпоинте.
:::

:::spoiler Что такое ProblemDetails?
Стандартный формат (RFC 9457) описания ошибок HTTP API: `type`, `title`, `status`, `detail`, `instance` и расширения (`traceId`, `errors`), тип содержимого `application/problem+json`.
:::

:::spoiler Какие бывают уровни логирования, и что писать на `Information`, а что на `Warning`? (ловушка: «всё на Error»)
`Trace`, `Debug`, `Information`, `Warning`, `Error`, `Critical`. `Information` — значимые события бизнеса; `Warning` — необычное, но обработанное; `Error` — сбой операции, требующий реакции. Ожидаемые ситуации вроде «не найдено» на `Error` не пишут.
:::

:::spoiler Как связать жалобу пользователя с записями в логах?
По `traceId`: он есть в теле ответа с ошибкой и в области каждой записи журнала для этого запроса.
:::

:::spoiler Чем `throw;` отличается от `throw ex;`?
`throw;` пробрасывает исключение, сохраняя исходный стек; `throw ex;` сбрасывает стек до текущей строки — теряется место возникновения.
:::

:::spoiler Что делать, если нужно по-разному обработать одно и то же исключение в разных эндпоинтах?
Использовать разные типы исключений или данные в них; общую схему «тип → код» держать в обработчике. Если отличий много — возвращать результат (`Result<T>`/`TypedResults`) для ожидаемых случаев вместо исключений.
:::

## Что запомнить

- Один формат ошибок на всё API — `ProblemDetails` (`application/problem+json`) с корректным статусом и `traceId`.
- Домен бросает свои исключения, глобальный `IExceptionHandler` превращает их в `404`/`409`/`422`/`403`; всё остальное — `500` без деталей.
- `UseExceptionHandler` — первым в конвейере; `UseStatusCodePages` оформляет «пустые» `404`/`405`.
- Логируй шаблонами (`{UserId}`), а не интерполяцией: тогда есть поля для поиска и нет лишней работы при выключенном уровне.
- Исключение логируй объектом (`LogError(ex, ...)`); пароли, токены и персональные данные в логи не пиши.
- Подробности ошибки — в логах и только в Development; клиенту — `traceId`.
- Serilog — стандарт под `ILogger`: настраивается из `appsettings`, ведёт структурированные логи в консоль, файлы, Seq.

## Практика

- [ ] Реализовал `DomainExceptionHandler`, убрал все `try/catch` из эндпоинтов
- [ ] Проверил ответы на 404, 409, 422, 400 и 500 (кинул исключение нарочно) — формат одинаковый
- [ ] Подключил Serilog и request logging, нашёл в логе свой запрос по `traceId` из ответа
- [ ] Прошёлся по коду: заменил все интерполяции в логах на шаблоны

@@page id="p4-auth" phase="4" kind="topic" title="Аутентификация и авторизация: JWT, роли, политики" nav="JWT, роли, политики" est="1,5–2 недели"
:::why
Цель из роадмапа — «умею подключить и **объяснить, что происходит на каждом шаге**». Безопасность — та область, где «скопировал из туториала и заработало» опаснее всего: одна ошибка в настройке проверки токена — и его можно подделать или использовать вечно.
:::

## Зачем это нужно

Почти любое реальное API нельзя открывать всем подряд: задачи принадлежат пользователям, удалять проекты могут только менеджеры, админка — только администраторам. Для этого нужны две отдельные вещи. Сначала система должна **узнать, кто пришёл** (аутентификация), и только потом решить, **что ему можно** (авторизация). Путаница между ними — источник половины вопросов на собеседованиях и многих реальных уязвимостей.

Кроме того, JWT — самый распространённый способ доказать серверу, кто ты, в API без браузерных сессий (мобильные приложения, SPA, сервисы друг с другом). Его ожидают увидеть в каждом учебном и тестовом проекте Junior .NET, и именно по нему проверяют, понимаешь ли ты, что происходит «под капотом», или просто скопировал настройки.

Что ты получишь от темы:

- безопасно хранить пароли (хэш, а не пароль);
- выдавать и проверять токены и объяснить каждый шаг пути токена;
- закрывать эндпоинты по уровням: публичные, для любого вошедшего, для роли или политики, для владельца ресурса;
- различать `401` и `403` и не путать их на собеседовании;
- знать, какие настройки проверки токена нельзя отключать.

Проверять будем запуском: хэширование паролей и устройство JWT — на реальном коде, а правила доступа — на настоящем сервере ASP.NET Core, куда мы отправим запросы с разными токенами.

## Интуиция и аналогия

**Билет на концерт.** Билет у входа не содержит ваших паролей; он содержит место и дату, а подлинность подтверждает печать организатора. Контролёр не звонит организатору на каждого зрителя: проверяет печать и дату. JWT устроен так же: сервер проверяет **подпись и срок**, а не ходит в базу. Печать нельзя подделать без штампа организатора (ключа), но **прочитать билет может любой**: на нём всё написано открыто.

**Пропуск в бизнес-центре.** Охранник на входе проверяет, настоящий ли пропуск (аутентификация): «вы тот, за кого себя выдаёте». Дверь серверной проверяет, разрешено ли именно этому пропуску открывать её (авторизация). Это разные проверки в разных местах, с разными ответами: «не пускаем вообще» (`401`) и «вы не имеете права на эту дверь» (`403`).

**Гардероб.** Номерок — не вещь, а ссылка. Если потерян или украден — вещь выдадут тому, у кого номерок. Токен — тот же номерок: чьи руки, тот и пользуется, поэтому токены живут недолго и передаются только по защищённому каналу (HTTPS).

## Основная теория по шагам

### Шаг 1. Два разных вопроса

- **Аутентификация** — *кто ты?* Проверить логин и пароль, выдать токен; на каждом запросе проверить токен и заполнить `HttpContext.User`.
- **Авторизация** — *что тебе можно?* Проверить роль, политику, право на конкретный ресурс.

В конвейере это два разных middleware (`UseAuthentication`, `UseAuthorization`), и порядок важен: сначала узнать пользователя, потом решать (мы проверяли на сервере в теме про [middleware](#p4-middleware): при перестановке даже верный токен даёт `401`).

### Шаг 2. Хранение паролей

Пароль нельзя хранить ни в открытом виде, ни зашифрованным (шифр можно расшифровать, ключ можно украсть). Хранят **необратимый хэш с солью** от медленной функции. `PasswordHasher<T>` входит в ASP.NET Core и делает всё правильно: случайная соль на каждый пароль, PBKDF2 с большим числом итераций, версия формата и параметры записаны прямо в хэш.

~~~csharp
using Microsoft.AspNetCore.Identity;

var hasher = new PasswordHasher<User>();
var user = new User { Email = "anna@example.com" };

var h1 = hasher.HashPassword(user, "S3cret-pass!");
var h2 = hasher.HashPassword(user, "S3cret-pass!");
Console.WriteLine($"Один пароль, два хэша, они равны? {h1 == h2}");
Console.WriteLine($"Верный пароль:   {hasher.VerifyHashedPassword(user, h1, "S3cret-pass!")}");
Console.WriteLine($"Тот же, второй:  {hasher.VerifyHashedPassword(user, h2, "S3cret-pass!")}");
Console.WriteLine($"Неверный пароль: {hasher.VerifyHashedPassword(user, h1, "s3cret-pass!")}");

var raw = Convert.FromBase64String(h1);
int iterations = (raw[5] << 24) | (raw[6] << 16) | (raw[7] << 8) | raw[8];
Console.WriteLine($"Версия формата: {raw[0]}, итераций PBKDF2 (записано в хэше): {iterations}");
Console.WriteLine($"В хэше есть исходный пароль? {h1.Contains("S3cret")}");

public sealed class User
{
    public int Id { get; set; }
    public string Email { get; set; } = "";
    public string PasswordHash { get; set; } = "";
    public string Role { get; set; } = "Member";
}
~~~
~~~console
Один пароль, два хэша, они равны? False
Верный пароль:   Success
Тот же, второй:  Success
Неверный пароль: Failed
Версия формата: 1, итераций PBKDF2 (записано в хэше): 100000
В хэше есть исходный пароль? False
~~~

Два вызова на один пароль дают разные хэши (случайная соль), но оба проверяются. Число итераций лежит в самом хэше: когда рекомендации ужесточатся, старые хэши продолжат работать, а при входе их можно перехешировать (`PasswordVerificationResult.SuccessRehashNeeded`). Быстрые хэши вроде MD5 или SHA-256 без соли и итераций для паролей не годятся: перебирать их можно миллиардами попыток в секунду.

### Шаг 3. Что такое JWT: разбираем руками

JSON Web Token — строка из трёх частей через точку: `заголовок.полезная_нагрузка.подпись`, каждая в Base64Url (Base64 без `+`, `/` и `=`). Заголовок говорит об алгоритме подписи, нагрузка содержит **claims** (утверждения: `sub` — идентификатор пользователя, `role`, `exp` — срок действия в секундах Unix, `iss` — кто выдал, `aud` — для кого), подпись — HMAC-SHA256 от первых двух частей с секретным ключом.

Соберём и проверим токен без библиотек, чтобы увидеть, что это просто три строки и одна подпись. Затем попробуем подделать: поменяем роль в нагрузке и оставим старую подпись.

~~~csharp
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

var key = Encoding.UTF8.GetBytes("очень-длинный-секретный-ключ-минимум-32-байта!");
long now = 1_900_000_000;                                     // фиксированное «сейчас» для воспроизводимости

string token = Jwt.Create(new() { ["sub"] = "42", ["role"] = "Member", ["iss"] = "taskboard", ["aud"] = "clients", ["exp"] = now + 1800 }, key);
Console.WriteLine($"Частей в токене: {token.Split('.').Length}");

// 1. Любой может прочитать нагрузку — это не шифрование
var parts = token.Split('.');
Console.WriteLine("Заголовок: " + Encoding.UTF8.GetString(Jwt.Unb64(parts[0])));
Console.WriteLine("Нагрузка:  " + Encoding.UTF8.GetString(Jwt.Unb64(parts[1])));

// 2. Проверка настоящего токена
Console.WriteLine("Настоящий токен:      " + Jwt.Validate(token, key, now, "taskboard", "clients"));

// 3. Подмена роли при старой подписи
var evilPayload = Jwt.B64(Encoding.UTF8.GetBytes("""{"sub":"42","role":"Admin","iss":"taskboard","aud":"clients","exp":1900001800}"""));
Console.WriteLine("Подменённая нагрузка: " + Jwt.Validate($"{parts[0]}.{evilPayload}.{parts[2]}", key, now, "taskboard", "clients"));

// 4. Другой ключ
Console.WriteLine("Подпись другим ключом: " + Jwt.Validate(Jwt.Create(new() { ["sub"] = "42", ["exp"] = now + 1800, ["iss"] = "taskboard", ["aud"] = "clients" }, Encoding.UTF8.GetBytes("другой-ключ-другой-ключ-другой-ключ!!")), key, now, "taskboard", "clients"));

// 5. Срок действия
Console.WriteLine("Через час после выдачи: " + Jwt.Validate(token, key, now + 3600, "taskboard", "clients"));

// 6. Другой получатель
Console.WriteLine("Чужой audience:       " + Jwt.Validate(token, key, now, "taskboard", "other-service"));

// 7. Атака «alg: none» — токен без подписи
var none = Jwt.B64(Encoding.UTF8.GetBytes("""{"alg":"none","typ":"JWT"}""")) + "." + parts[1] + ".";
Console.WriteLine("alg=none:             " + Jwt.Validate(none, key, now, "taskboard", "clients"));

static class Jwt
{
    public static string B64(byte[] b) => Convert.ToBase64String(b).TrimEnd('=').Replace('+', '-').Replace('/', '_');
    public static byte[] Unb64(string s)
    {
        s = s.Replace('-', '+').Replace('_', '/');
        return Convert.FromBase64String(s + new string('=', (4 - s.Length % 4) % 4));
    }
    static byte[] Sign(string data, byte[] key) => HMACSHA256.HashData(key, Encoding.ASCII.GetBytes(data));

    public static string Create(Dictionary<string, object> claims, byte[] key)
    {
        var header = B64(Encoding.UTF8.GetBytes("""{"alg":"HS256","typ":"JWT"}"""));
        var payload = B64(JsonSerializer.SerializeToUtf8Bytes(claims));
        return $"{header}.{payload}.{B64(Sign($"{header}.{payload}", key))}";
    }

    public static string Validate(string token, byte[] key, long now, string issuer, string audience)
    {
        var p = token.Split('.');
        if (p.Length != 3) return "отклонён: не три части";
        using var h = JsonDocument.Parse(Unb64(p[0]));
        if (h.RootElement.GetProperty("alg").GetString() != "HS256") return "отклонён: алгоритм не HS256";    // алгоритм задаём МЫ, а не токен
        if (!CryptographicOperations.FixedTimeEquals(Sign($"{p[0]}.{p[1]}", key), Unb64(p[2]))) return "отклонён: подпись не совпала";
        using var d = JsonDocument.Parse(Unb64(p[1]));
        var r = d.RootElement;
        if (r.GetProperty("exp").GetInt64() <= now) return "отклонён: срок истёк";
        if (r.GetProperty("iss").GetString() != issuer) return "отклонён: не тот издатель";
        if (r.GetProperty("aud").GetString() != audience) return "отклонён: не тот получатель";
        return $"принят (sub={r.GetProperty("sub")}, role={(r.TryGetProperty("role", out var role) ? role : "—")})";
    }
}
~~~
~~~console
Частей в токене: 3
Заголовок: {"alg":"HS256","typ":"JWT"}
Нагрузка:  {"sub":"42","role":"Member","iss":"taskboard","aud":"clients","exp":1900001800}
Настоящий токен:      принят (sub=42, role=Member)
Подменённая нагрузка: отклонён: подпись не совпала
Подпись другим ключом: отклонён: подпись не совпала
Через час после выдачи: отклонён: срок истёк
Чужой audience:       отклонён: не тот получатель
alg=none:             отклонён: алгоритм не HS256
~~~

Три вывода из эксперимента. Первое: нагрузка читается без всякого ключа — **JWT подписан, но не зашифрован**, поэтому паспортных данных, паролей и секретов в нём быть не должно. Второе: подпись защищает от *изменения*, и подмена роли с сохранением старой подписи не проходит. Третье: проверка состоит из нескольких независимых условий (алгоритм, подпись, срок, издатель, получатель), и **каждое отключённое условие — дыра**.

### Шаг 4. Путь токена от логина до эндпоинта {#flow}

~~~text
 1. POST /api/auth/login { email, password }
 2. Сервер находит пользователя и сверяет ХЭШ пароля
 3. Сервер формирует claims (sub, role), подписывает ключом → JWT (живёт, например, 30 минут)
 4. Клиент хранит токен и шлёт в каждом запросе: Authorization: Bearer <JWT>
 5. UseAuthentication: проверяются алгоритм, подпись, issuer, audience, срок действия
       ├─ всё верно → HttpContext.User = ClaimsPrincipal с claims из токена
       └─ иначе → пользователь анонимный (или ошибка проверки)
 6. UseAuthorization: эндпоинт требует [Authorize] / роль / политику
       ├─ анонимный → 401 (Challenge)
       ├─ вошёл, но прав нет → 403 (Forbid)
       └─ всё хорошо → вызов эндпоинта
~~~

На вопрос «пройди путь токена от логина до вызова эндпоинта» отвечают по этим шести шагам, с упоминанием, **что именно проверяется на пятом**.

### Шаг 5. Выдача и проверка токена в ASP.NET Core

В боевом коде токены выдаёт и проверяет библиотека; код ниже — стандартная настройка. (Пакет `Microsoft.AspNetCore.Authentication.JwtBearer` ставится из NuGet, в нашей среде без доступа к нему этот блок не запускался; те же правила доступа мы запустим на настоящем сервере в шаге 6.)

~~~bash
dotnet add package Microsoft.AspNetCore.Authentication.JwtBearer
~~~

~~~csharp Application/Auth/TokenService.cs @nocheck
using System.Security.Claims;
using System.Text;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;

public sealed class JwtOptions
{
    public string Issuer { get; set; } = "";
    public string Audience { get; set; } = "";
    public string Key { get; set; } = "";             // минимум 32 байта; хранится в секретах!
    public int LifetimeMinutes { get; set; } = 30;
}

public sealed class TokenService(IOptions<JwtOptions> options, TimeProvider time)
{
    private readonly JwtOptions _o = options.Value;

    public string Create(User user)
    {
        var claims = new[]
        {
            new Claim("sub", user.Id.ToString()),
            new Claim("email", user.Email),
            new Claim("role", user.Role),
        };
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_o.Key));
        var descriptor = new SecurityTokenDescriptor
        {
            Subject = new ClaimsIdentity(claims),
            Issuer = _o.Issuer,
            Audience = _o.Audience,
            Expires = time.GetUtcNow().UtcDateTime.AddMinutes(_o.LifetimeMinutes),
            SigningCredentials = new SigningCredentials(key, SecurityAlgorithms.HmacSha256),
        };
        return new JsonWebTokenHandler().CreateToken(descriptor);
    }
}
~~~

~~~csharp Program.cs @nocheck
var jwt = builder.Configuration.GetSection("Jwt").Get<JwtOptions>()!;
builder.Services.Configure<JwtOptions>(builder.Configuration.GetSection("Jwt"));
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddScoped<TokenService>();

builder.Services
    .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(o =>
    {
        o.MapInboundClaims = false;                    // оставить имена claims как в токене: "sub", "role"
        o.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,           ValidIssuer = jwt.Issuer,
            ValidateAudience = true,         ValidAudience = jwt.Audience,
            ValidateIssuerSigningKey = true, IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwt.Key)),
            ValidateLifetime = true,         ClockSkew = TimeSpan.FromSeconds(30),
            NameClaimType = "sub",
            RoleClaimType = "role",          // откуда брать роли для RequireRole / [Authorize(Roles = ...)]
        };
    });

builder.Services.AddAuthorizationBuilder()
    .AddPolicy("CanManageProjects", p => p.RequireRole("Manager", "Admin"))
    .AddPolicy("AdminOnly", p => p.RequireRole("Admin"));

var app = builder.Build();
app.UseAuthentication();
app.UseAuthorization();

app.MapPost("/api/auth/login", async (LoginRequest req, AppDbContext db, TokenService tokens) =>
{
    var user = await db.Users.SingleOrDefaultAsync(u => u.Email == req.Email);
    if (user is null) return Results.Unauthorized();
    var check = new PasswordHasher<User>().VerifyHashedPassword(user, user.PasswordHash, req.Password);
    return check == PasswordVerificationResult.Failed
        ? Results.Unauthorized()
        : Results.Ok(new { accessToken = tokens.Create(user) });
});

app.MapGet("/api/me", (ClaimsPrincipal user) => new { id = user.FindFirst("sub")?.Value, role = user.FindFirst("role")?.Value })
   .RequireAuthorization();                                   // любой аутентифицированный

app.MapDelete("/api/projects/{id:int}", (int id) => Results.NoContent())
   .RequireAuthorization("CanManageProjects");                // политика с ролями
~~~

В контроллерах то же самое выражается атрибутами: `[Authorize]`, `[Authorize(Roles = "Admin")]`, `[Authorize(Policy = "CanManageProjects")]`, `[AllowAnonymous]`.

### Шаг 6. Правила доступа на настоящем сервере

Сам механизм аутентификации в ASP.NET Core — **схема** (scheme) с обработчиком, который превращает запрос в `ClaimsPrincipal`. Это часть фреймворка, и JwtBearer — лишь готовая реализация такого обработчика. Напишем свой обработчик на нашем `Jwt` из шага 3 и поднимем настоящий сервер с политиками. Он проверит четыре уровня: публичный эндпоинт, любой вошедший, роль/политика и владелец ресурса. И покажет, какие запросы дают `401`, какие — `403`.

~~~csharp
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Encodings.Web;
using System.Text.Json;
using Microsoft.AspNetCore.Authentication;
using Microsoft.Extensions.Options;

var key = Encoding.UTF8.GetBytes("очень-длинный-секретный-ключ-минимум-32-байта!");
const long Now = 1_900_000_000;                                  // «текущее время» сервера — фиксированное
BearerHandler.Key = key; BearerHandler.Now = Now;

var builder = WebApplication.CreateBuilder();
builder.WebHost.UseUrls("http://127.0.0.1:0");
builder.Logging.ClearProviders();
builder.Services.AddAuthentication("Bearer").AddScheme<AuthenticationSchemeOptions, BearerHandler>("Bearer", null);
builder.Services.AddAuthorizationBuilder()
    .AddPolicy("CanManageProjects", p => p.RequireRole("Manager", "Admin"))
    .AddPolicy("AdminOnly", p => p.RequireRole("Admin"));

var app = builder.Build();
app.UseAuthentication();
app.UseAuthorization();

var tasks = new Dictionary<int, int> { [1] = 42, [2] = 7 };     // задача → id исполнителя

app.MapGet("/public", () => "открыто всем");
app.MapGet("/me", (ClaimsPrincipal u) => $"sub={u.FindFirst("sub")?.Value}, role={u.FindFirst("role")?.Value}").RequireAuthorization();
app.MapDelete("/projects/{id:int}", (int id) => "проект удалён").RequireAuthorization("CanManageProjects");
app.MapGet("/admin", () => "админка").RequireAuthorization("AdminOnly");
app.MapPut("/tasks/{id:int}", (int id, ClaimsPrincipal u) =>
{
    if (!tasks.TryGetValue(id, out var assignee)) return Results.NotFound();
    bool manager = u.IsInRole("Manager") || u.IsInRole("Admin");
    if (!manager && assignee.ToString() != u.FindFirst("sub")?.Value)
        return Results.Problem("Можно редактировать только свои задачи", statusCode: 403);      // проверка владельца
    return Results.Ok($"задача {id} обновлена");
}).RequireAuthorization();

await app.StartAsync();
using var http = new HttpClient { BaseAddress = new Uri(app.Urls.First()) };

string Tok(string sub, string role, long exp = Now + 1800) => Jwt.Create(new() { ["sub"] = sub, ["role"] = role, ["exp"] = exp }, key);
var anna = Tok("42", "Member");           // обычный участник, исполнитель задачи 1
var boss = Tok("5", "Manager");
var root = Tok("1", "Admin");
var old = Tok("42", "Member", Now - 10);
var parts = anna.Split('.');
var forged = $"{parts[0]}.{Jwt.B64(Encoding.UTF8.GetBytes("""{"sub":"42","role":"Admin","exp":1900001800}"""))}.{parts[2]}";

async Task Call(string label, HttpMethod m, string path, string? token)
{
    using var req = new HttpRequestMessage(m, path);
    if (token != null) req.Headers.Authorization = new("Bearer", token);
    var r = await http.SendAsync(req);
    Console.WriteLine($"{label,-44} → {(int)r.StatusCode}");
}

await Call("публичный, без токена",                     HttpMethod.Get,    "/public", null);
await Call("/me без токена",                            HttpMethod.Get,    "/me", null);
await Call("/me с токеном участника",                   HttpMethod.Get,    "/me", anna);
await Call("/me с истёкшим токеном",                    HttpMethod.Get,    "/me", old);
await Call("/me с подменённой нагрузкой",               HttpMethod.Get,    "/me", forged);
await Call("/me с мусором вместо токена",               HttpMethod.Get,    "/me", "abc.def.ghi");
await Call("удаление проекта: участник",                HttpMethod.Delete, "/projects/1", anna);
await Call("удаление проекта: менеджер",                HttpMethod.Delete, "/projects/1", boss);
await Call("/admin: менеджер",                          HttpMethod.Get,    "/admin", boss);
await Call("/admin: администратор",                     HttpMethod.Get,    "/admin", root);
await Call("своя задача (участник → задача 1)",         HttpMethod.Put,    "/tasks/1", anna);
await Call("чужая задача (участник → задача 2)",        HttpMethod.Put,    "/tasks/2", anna);
await Call("чужая задача (менеджер → задача 2)",        HttpMethod.Put,    "/tasks/2", boss);
await Call("несуществующая задача",                     HttpMethod.Put,    "/tasks/99", anna);
await app.StopAsync();

sealed class BearerHandler(IOptionsMonitor<AuthenticationSchemeOptions> options, ILoggerFactory logger, UrlEncoder encoder)
    : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
{
    public static byte[] Key = [];
    public static long Now;

    protected override Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        var header = Request.Headers.Authorization.ToString();
        if (!header.StartsWith("Bearer ")) return Task.FromResult(AuthenticateResult.NoResult());   // токена нет — просто аноним
        var token = header["Bearer ".Length..];
        try
        {
            var claims = Jwt.ValidateToClaims(token, Key, Now);                                      // бросает при любой проблеме
            var identity = new ClaimsIdentity(claims, "Bearer", nameType: "sub", roleType: "role");  // roleType: откуда брать роли
            return Task.FromResult(AuthenticateResult.Success(new AuthenticationTicket(new ClaimsPrincipal(identity), "Bearer")));
        }
        catch (Exception e)
        {
            return Task.FromResult(AuthenticateResult.Fail(e.Message));
        }
    }
}

static class Jwt
{
    public static string B64(byte[] b) => Convert.ToBase64String(b).TrimEnd('=').Replace('+', '-').Replace('/', '_');
    public static byte[] Unb64(string s)
    {
        s = s.Replace('-', '+').Replace('_', '/');
        return Convert.FromBase64String(s + new string('=', (4 - s.Length % 4) % 4));
    }
    static byte[] Sign(string data, byte[] key) => HMACSHA256.HashData(key, Encoding.ASCII.GetBytes(data));

    public static string Create(Dictionary<string, object> claims, byte[] key)
    {
        var header = B64(Encoding.UTF8.GetBytes("""{"alg":"HS256","typ":"JWT"}"""));
        var payload = B64(JsonSerializer.SerializeToUtf8Bytes(claims));
        return $"{header}.{payload}.{B64(Sign($"{header}.{payload}", key))}";
    }

    public static List<Claim> ValidateToClaims(string token, byte[] key, long now)
    {
        var p = token.Split('.');
        if (p.Length != 3) throw new FormatException("не три части");
        using var h = JsonDocument.Parse(Unb64(p[0]));
        if (h.RootElement.GetProperty("alg").GetString() != "HS256") throw new FormatException("алгоритм");
        if (!CryptographicOperations.FixedTimeEquals(Sign($"{p[0]}.{p[1]}", key), Unb64(p[2]))) throw new FormatException("подпись");
        using var d = JsonDocument.Parse(Unb64(p[1]));
        if (d.RootElement.GetProperty("exp").GetInt64() <= now) throw new FormatException("срок истёк");
        return d.RootElement.EnumerateObject().Select(x => new Claim(x.Name, x.Value.ToString())).ToList();
    }
}
~~~
~~~console
публичный, без токена                        → 200
/me без токена                               → 401
/me с токеном участника                      → 200
/me с истёкшим токеном                       → 401
/me с подменённой нагрузкой                  → 401
/me с мусором вместо токена                  → 401
удаление проекта: участник                   → 403
удаление проекта: менеджер                   → 200
/admin: менеджер                             → 403
/admin: администратор                        → 200
своя задача (участник → задача 1)            → 200
чужая задача (участник → задача 2)           → 403
чужая задача (менеджер → задача 2)           → 200
несуществующая задача                        → 404
~~~

Теперь видно, как устроены коды. **Нет токена, истёкший, подделанный или мусорный → `401`**: сервер не знает, кто пришёл. **Токен верный, но роли не хватает → `403`**: пользователь известен, но ему нельзя. Владельца ресурса проверяет код эндпоинта или сервиса, потому что политика роли не знает, «чья» задача; здесь мы отдали `403` через `Problem`, а если не хочется раскрывать существование чужого ресурса, возвращают `404`. Менеджер редактирует чужую задачу, участник — нет.

### Шаг 7. Роль, политика, право на ресурс

- **Роль** — значение claim (например, `role=Manager`).
- **Политика** — именованное правило, которое может проверять роли, любые claims и произвольные условия (`RequireClaim`, `RequireAssertion`, свой `IAuthorizationRequirement`). Эндпоинты ссылаются на *имя* политики, а состав правил меняется в одном месте.
- **Право на ресурс** — «твоя ли это задача»; зависит от данных, поэтому проверяется в сервисе или через `IAuthorizationService` с ресурсом.

~~~csharp Application/TaskService.cs @nocheck
public async Task UpdateAsync(int taskId, int currentUserId, bool isManager, UpdateTaskRequest req, CancellationToken ct)
{
    var task = await _tasks.FindAsync(taskId, ct) ?? throw new NotFoundException($"Задача {taskId} не найдена");
    if (!isManager && task.AssigneeId != currentUserId)
        throw new ForbiddenException("Можно редактировать только свои задачи");   // обработчик ошибок → 403
    // ...
}
~~~

Исключение `ForbiddenException` превращается в `403` глобальным обработчиком из темы про [ошибки](#p4-errors).

:::deep Граница
Refresh-токены и их ротация, OAuth 2.0 / OpenID Connect с внешними провайдерами, ASP.NET Core Identity целиком, хранение токенов в браузере — следующий уровень. Для проекта Фазы 4 достаточно access-токена с коротким сроком жизни; в README честно напиши, чего нет.
:::

## Как это работает под капотом

- **Схемы и обработчики.** `AddAuthentication` регистрирует схемы; каждая схема — это обработчик (`AuthenticationHandler`), который умеет три действия: *Authenticate* (из запроса получить пользователя), *Challenge* (ответить «предъявите документы» — обычно `401`), *Forbid* (ответить «нельзя» — `403`). JwtBearer — готовая реализация; мы выше написали собственную.
- **`UseAuthentication`** вызывает обработчик схемы по умолчанию и, если он вернул успех, кладёт `ClaimsPrincipal` в `HttpContext.User`. Если токена нет, пользователь остаётся анонимным — это не ошибка. Ошибка (неверная подпись и т. п.) тоже не обрывает запрос сразу: пользователь анонимный, а `401` вернёт авторизация, если эндпоинт защищён.
- **`UseAuthorization`** читает метаданные выбранного эндпоинта (`[Authorize]`, `RequireAuthorization`), оценивает требования политики и вызывает Challenge (для анонимного) или Forbid (для известного, но без прав). Поэтому middleware должно стоять после `UseRouting` и перед выполнением эндпоинта.
- **Claims.** `ClaimsPrincipal` — набор удостоверений (`ClaimsIdentity`), в каждом список утверждений. `IsInRole("Admin")` и `RequireRole` ищут claim того типа, который указан в `RoleClaimType` удостоверения; если типы не совпали, роль «не видна» — классическая причина «роль в токене есть, а `403`».
- **Маппинг claims.** По умолчанию JwtBearer переименовывает «короткие» имена в длинные URI из старой схемы Microsoft (`sub` → `…/nameidentifier`, `role` → `…/role`). `MapInboundClaims = false` отключает переименование, и тогда нужно соответственно указать `NameClaimType` и `RoleClaimType`, как в настройке выше.
- **Проверка подписи.** Для HS256 ключ симметричный: тот, кто может проверить подпись, может её и создать, поэтому ключ нужен только серверу, выдающему и проверяющему токены. Для сценариев, когда проверять должны многие, а выдавать — один, используют асимметричные алгоритмы (RS256/ES256): подписывает приватный ключ, проверяет публичный.
- **Алгоритм выбирает сервер.** Токен сам заявляет алгоритм в заголовке, но доверять этому нельзя: иначе атакующий пришлёт `alg: none` (без подписи) или подменит алгоритм. Мы в проверке жёстко требуем HS256; библиотеки делают то же через допустимые алгоритмы и ключи.
- **Сравнение подписей.** Подписи сравнивают за постоянное время (`CryptographicOperations.FixedTimeEquals`), чтобы по времени ответа нельзя было подобрать подпись побайтово.
- **Срок жизни и `ClockSkew`.** Часы серверов расходятся, поэтому библиотека по умолчанию добавляет допуск (по умолчанию 5 минут); мы в настройке уменьшили его до 30 секунд.
- **Токен нельзя отозвать.** Сервер не хранит токены — это и есть причина, по которой он быстрый и масштабируется. Платой становится невозможность отозвать токен до `exp`, поэтому access-токены делают короткоживущими, а для долгой сессии используют refresh-токен, который хранится на сервере и может быть отозван.
- **Где хранить токен на клиенте.** В `localStorage` его может украсть любой XSS, в cookie с `HttpOnly` — защищён от скриптов, но тогда нужна защита от CSRF. Универсального ответа нет, важно знать компромисс.

## Типичные ошибки и ловушки

- **Отключены `ValidateIssuerSigningKey`, `ValidateLifetime`, `ValidateAudience` «чтобы заработало».** Токен можно подделать или использовать вечно.
- **Короткий или закоммиченный в git ключ подписи.** Ключ — секрет; хранится в переменных окружения, секретах или хранилище, длина не менее 32 байт для HS256.
- **Разные сообщения «нет такого email» и «неверный пароль».** Подсказывают атакующему, какие аккаунты существуют; отвечай одинаково — `401`.
- **Пароль в открытом виде, быстрый хэш (MD5, SHA-256), «своё» шифрование.** Только `PasswordHasher<T>` или аналог на PBKDF2/bcrypt/Argon2.
- **Секреты и персональные данные в payload.** Он читается всеми.
- **Токен вечный или живёт неделями.** Украденным токеном можно пользоваться всё это время.
- **Путаница `401` и `403`.** `401` — «не знаю, кто ты»; `403` — «знаю, но нельзя».
- **Проверяют только роль, но не владельца.** Любой участник может менять и читать чужие данные, зная их `id` (классическая уязвимость IDOR).
- **`UseAuthorization` до `UseAuthentication`.** Все запросы анонимные, и даже верный токен даёт `401`.
- **Роль есть в токене, а `[Authorize(Roles=…)]` не срабатывает.** Не совпал `RoleClaimType` (после отключения маппинга claims).
- **Проверка только на клиенте.** Скрытая кнопка не защищает эндпоинт; решает всегда сервер.
- **Токены и пароли в логах и в URL.** Они попадут в журналы, историю браузера, прокси.
- **Доступ по HTTP без TLS.** Токен в открытом виде перехватывается.

## Вопросы с собеседований

:::spoiler Пройди путь токена от логина до вызова эндпоинта.
Логин → сверка хэша пароля → формирование claims → подпись ключом → клиент шлёт `Authorization: Bearer` → UseAuthentication проверяет алгоритм, подпись, issuer, audience, срок → `HttpContext.User` → UseAuthorization проверяет роль/политику → `401`/`403` или вызов эндпоинта.
:::

:::spoiler Можно ли положить в JWT номер паспорта пользователя? (ловушка: «токен же подписан»)
Нет. Подпись защищает от изменения, но не от чтения: payload только закодирован (Base64Url), его прочитает любой, у кого есть токен.
:::

:::spoiler Чем аутентификация отличается от авторизации?
Аутентификация отвечает «кто ты», авторизация — «что тебе можно». Результат первой — `ClaimsPrincipal`; вторая использует его, чтобы пропустить или отказать.
:::

:::spoiler Чем `401` отличается от `403`?
`401` — пользователь не аутентифицирован (нет или неверный токен). `403` — аутентифицирован, но прав недостаточно.
:::

:::spoiler Чем роль отличается от политики?
Роль — значение claim. Политика — именованное правило авторизации, которое может проверять роли, другие claims и произвольные условия. Эндпоинты ссылаются на политики, а состав политики меняется в одном месте.
:::

:::spoiler Как хранить пароли? (ловушка: «зашифровать»)
Не шифровать, а хранить необратимый хэш с уникальной солью от медленной функции (PBKDF2, bcrypt, Argon2); в ASP.NET Core — `PasswordHasher<T>`. Шифр обратим: украдут ключ — получат все пароли.
:::

:::spoiler Как отозвать выданный JWT?
До истечения срока — никак, сервер токены не хранит. Поэтому access-токены делают короткими (минуты), а долгую сессию обеспечивают refresh-токеном, который хранится на сервере и может быть отозван; либо ведут список отозванных токенов (теряя «бессерверность»).
:::

:::spoiler Что произойдёт, если отключить проверку подписи?
Любой сможет сам собрать токен с любыми claims (в том числе `role=Admin`) и получить любой доступ. То же с отключённой проверкой срока и получателя.
:::

:::spoiler Достаточно ли `[Authorize(Roles = "Manager")]`, чтобы менеджер не видел чужие проекты?
Нет. Роль говорит о типе пользователя, но не о принадлежности ресурса. Принадлежность (владелец, команда) проверяется отдельно по данным, иначе возникает IDOR.
:::

## Что запомнить

- Аутентификация — «кто ты» (`UseAuthentication`, схема, `ClaimsPrincipal`); авторизация — «что можно» (`UseAuthorization`, роли, политики, ресурс). Порядок в конвейере: сначала первая.
- `401` — не знаем, кто ты; `403` — знаем, но нельзя.
- Пароль хранится как хэш с солью (`PasswordHasher<T>`); шифровать и использовать быстрые хэши нельзя.
- JWT = заголовок + нагрузка + подпись; **подписан, но не зашифрован** — секретов внутри быть не должно.
- Проверяй всё: алгоритм (выбирает сервер), подпись, срок, издатель, получатель. Каждое отключённое условие — дыра.
- Токен нельзя отозвать: короткая жизнь access-токена + refresh-токен.
- Роль не заменяет проверку владельца ресурса.
- Ключ подписи — секрет: не в git, не короче 32 байт.

## Практика

- [ ] Реализовал регистрацию (хэш пароля) и логин с выдачей JWT
- [ ] Раскодировал свой токен и проверил содержимое и срок действия
- [ ] Закрыл эндпоинты: публичные, для любого пользователя, для роли/политики, проверка владельца в сервисе
- [ ] Проверил `.http`-файлом: без токена → 401, с токеном без роли → 403, с истёкшим токеном → 401, с подменённым payload → 401
- [ ] Записал голосовую заметку «путь токена по шагам»

@@page id="p4-docker" phase="4" kind="topic" title="OpenAPI и Docker: документация и запуск одной командой" nav="OpenAPI и Docker" est="~1 неделя"
:::why
**Третий пункт критерия:** проект запускается в Docker одной командой. Это то, что позволяет ревьюеру или работодателю запустить твой API за минуту, не устанавливая PostgreSQL и .NET. OpenAPI-документ даёт клиентам точное описание твоего API.
:::

## Зачем это нужно

Фраза «у меня на компьютере работает» — самая дорогая в разработке. Чужой компьютер отличается версией .NET, версией PostgreSQL, портами, переменными окружения, и каждое отличие превращается в вечер потерянного времени. Docker решает это тем, что упаковывает приложение вместе с окружением в образ, который запускается одинаково на любой машине. Docker Compose добавляет к этому описание *всей системы*: API, база, порядок запуска, сеть, тома — в одном файле.

OpenAPI решает другую проблему: как рассказать клиенту (фронтенду, мобильному приложению, коллеге, ревьюеру), что умеет API. Вместо устной договорённости и устаревшей вики — машиночитаемый документ, который генерируется из самого кода и потому не врёт. По нему строят интерактивную страницу, проверяют контракт, генерируют клиентов.

Вместе эти две вещи дают проекту «обложку»: открыл репозиторий, выполнил `docker compose up`, перешёл на страницу документации и сразу пробуешь запросы. Для Junior-портфолио это один из самых заметных сигналов: проект не просто «компилируется у автора», а воспроизводим и описан. На собеседованиях ждут, что ты объяснишь Dockerfile построчно, различишь образ и контейнер и скажешь, почему в compose используется `Host=db`, а не `localhost`.

Что ты получишь от темы:

- понимать, откуда генератор берёт описание эндпоинтов, и поправить документ, если он неточный;
- написать Dockerfile с многоэтапной сборкой и объяснить каждую строку;
- поднять API и базу командой `docker compose up --build`;
- настроить приложение переменными окружения, не пересобирая образ;
- добавить проверку работоспособности (health check), по которой compose понимает, что сервис готов.

В нашей учебной среде Docker запустить нельзя, поэтому всё, что относится к Docker и compose, помечено как непроверенное запуском; проверенными запуском на реальном сервере ASP.NET Core являются те части, которые принадлежат самому приложению: описание эндпоинтов (откуда берётся OpenAPI), чтение конфигурации из переменных окружения и проверки работоспособности.

## Интуиция и аналогия

**Контейнер для перевозки грузов.** Грузы разные, а контейнер — стандартный: порт, кран и грузовик не заботятся о содержимом. Docker-образ — это тоже стандартная упаковка: платформе безразлично, что внутри, она запускает один и тот же образ везде.

**Образ и контейнер — класс и объект.** Образ — неизменяемый шаблон (как класс), контейнер — запущенный экземпляр (как объект). Из одного образа можно запустить несколько контейнеров, и у каждого будет собственная файловая система поверх слоёв образа.

**Compose — сценарий спектакля.** Он говорит, кто выходит на сцену (сервисы), в каком порядке (`depends_on`), как они общаются (сеть) и что остаётся после спектакля (тома).

**OpenAPI — меню ресторана.** Клиент не лезет на кухню: он читает меню и заказывает. Если меню автоматически собирается из того, что реально умеет кухня, оно не устареет.

## Основная теория по шагам

### Шаг 1. Откуда OpenAPI знает про твои эндпоинты

Генератор документа не читает комментарии и не угадывает: он смотрит на **метаданные эндпоинтов** — то, что ASP.NET Core уже хранит про каждый маршрут. Это HTTP-методы, шаблон маршрута, имя, теги, требования авторизации, типы и коды ответов. Типизированные результаты (`Results<Ok<T>, NotFound>`) сами добавляют метаданные об ответах, а для обычных `IResult` их задают вручную через `.Produces<T>(code)`. Посмотрим на эти метаданные своими глазами — на реальных эндпоинтах:

~~~csharp
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Http.Metadata;
using Microsoft.AspNetCore.Routing;

var builder = WebApplication.CreateBuilder();
builder.Services.AddAuthorization();
var app = builder.Build();

// 1. Типизированный результат: метаданные об ответах появляются сами
app.MapGet("/api/tasks/{id:int}", Results<Ok<TaskDto>, NotFound> (int id) =>
        id == 1 ? TypedResults.Ok(new TaskDto(1, "Написать тест")) : TypedResults.NotFound())
   .WithName("GetTask").WithTags("Tasks");

// 2. Обычный IResult: генератор ничего не знает, пока мы не скажем
app.MapPost("/api/tasks", (CreateTask req) => Results.Created($"/api/tasks/1", new TaskDto(1, req.Title)))
   .WithName("CreateTask").WithTags("Tasks")
   .Produces<TaskDto>(StatusCodes.Status201Created)
   .ProducesProblem(StatusCodes.Status400BadRequest)
   .RequireAuthorization();

// 3. Забыли описать
app.MapDelete("/api/tasks/{id:int}", (int id) => Results.NoContent());

foreach (var ep in ((IEndpointRouteBuilder)app).DataSources.SelectMany(d => d.Endpoints).OfType<RouteEndpoint>())
{
    var methods = string.Join(",", ep.Metadata.GetMetadata<IHttpMethodMetadata>()!.HttpMethods);
    var name = ep.Metadata.GetMetadata<IEndpointNameMetadata>()?.EndpointName ?? "—";
    var tags = string.Join(",", ep.Metadata.GetMetadata<ITagsMetadata>()?.Tags ?? []);
    var auth = ep.Metadata.GetMetadata<IAuthorizeData>() != null;
    var responses = ep.Metadata.GetOrderedMetadata<IProducesResponseTypeMetadata>()
        .OrderBy(m => m.StatusCode)
        .Select(m => m.Type == null || m.Type == typeof(void) ? $"{m.StatusCode}" : $"{m.StatusCode}:{m.Type.Name}");
    Console.WriteLine($"{methods,-6} {ep.RoutePattern.RawText,-22} имя={name,-10} теги={tags,-6} авторизация={auth,-5} ответы=[{string.Join(", ", responses)}]");
}

record TaskDto(int Id, string Title);
record CreateTask(string Title);
~~~
~~~console
GET    /api/tasks/{id:int}    имя=GetTask    теги=Tasks  авторизация=False ответы=[200:TaskDto, 404]
POST   /api/tasks             имя=CreateTask теги=Tasks  авторизация=True  ответы=[201:TaskDto, 400:ProblemDetails]
DELETE /api/tasks/{id:int}    имя=—          теги=       авторизация=False ответы=[]
~~~

Первый эндпоинт описал себя полностью: коды `200` и `404` взялись из типа результата. Второй мы описали вручную, и в документе будут `201` и проблемный `400`. Третий «забыт»: в документе он будет без ответов, а клиент не узнает, что возможен `204`. Отсюда правило: **документ точен ровно настолько, насколько точны метаданные**, и проверять его надо глазами, а не доверять автоматике.

### Шаг 2. Подключаем OpenAPI

~~~bash .NET 9+ — встроенная генерация документа
dotnet add package Microsoft.AspNetCore.OpenApi
~~~

~~~csharp Program.cs @nocheck
builder.Services.AddOpenApi();

var app = builder.Build();
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();          // документ: /openapi/v1.json
}
~~~

Встроенный пакет генерирует **документ**, но не UI. Для интерактивной страницы подключают Swagger UI (`Swashbuckle.AspNetCore.SwaggerUI`) или Scalar (`Scalar.AspNetCore`) и указывают адрес документа. В проектах на .NET 8 обычно используется Swashbuckle целиком (`AddSwaggerGen` + `UseSwagger` + `UseSwaggerUI`). Это сторонние и внешние пакеты из NuGet; в нашей среде без доступа к нему мы их не запускали, но метаданные, из которых они строят документ, проверены выше.

Для ручной проверки и воспроизводимых сценариев удобны `.http`-файлы прямо в репозитории (поддерживаются Visual Studio, Rider и расширением VS Code):

~~~text TaskBoard.Api.http
@host = http://localhost:8080
@token = вставь_токен_после_логина

POST {{host}}/api/auth/login
Content-Type: application/json

{ "email": "anna@example.com", "password": "S3cret-pass!" }

###

GET {{host}}/api/tasks?status=todo&page=1&pageSize=20
Authorization: Bearer {{token}}
~~~

### Шаг 3. Конфигурация через переменные окружения

Образ собирается один раз и работает в разных окружениях, поэтому настройки приходят снаружи — через переменные окружения. В ASP.NET Core двоеточие в ключе конфигурации заменяется двойным подчёркиванием: `ConnectionStrings__Default` превращается в ключ `ConnectionStrings:Default`. Проверим это, а заодно узнаем, как устроена настройка порта 8080 в контейнерах:

~~~csharp
// как будто их передал docker compose в разделе environment
Environment.SetEnvironmentVariable("ConnectionStrings__Default", "Host=db;Port=5432;Database=taskboard;Username=app;Password=app_dev_password");
Environment.SetEnvironmentVariable("Jwt__Key", "ключ-из-файла-.env-ключ-из-файла-.env");
Environment.SetEnvironmentVariable("ASPNETCORE_HTTP_PORTS", "8080");        // так образы .NET 8+ выбирают порт

var builder = WebApplication.CreateBuilder();
var cfg = builder.Configuration;

Console.WriteLine("ConnectionStrings:Default → " + cfg["ConnectionStrings:Default"]);
Console.WriteLine("GetConnectionString       → " + cfg.GetConnectionString("Default"));
Console.WriteLine("Jwt:Key задан, длина      → " + cfg["Jwt:Key"]!.Length);
Console.WriteLine("Jwt:Issuer (не задан)     → " + (cfg["Jwt:Issuer"] ?? "null"));
Console.WriteLine("HTTP_PORTS (без префикса) → " + cfg["HTTP_PORTS"]);
Console.WriteLine("Хост подключения по имени сервиса, а не localhost: " + !cfg.GetConnectionString("Default")!.Contains("localhost"));
~~~
~~~console
ConnectionStrings:Default → Host=db;Port=5432;Database=taskboard;Username=app;Password=app_dev_password
GetConnectionString       → Host=db;Port=5432;Database=taskboard;Username=app;Password=app_dev_password
Jwt:Key задан, длина      → 37
Jwt:Issuer (не задан)     → null
HTTP_PORTS (без префикса) → 8080
Хост подключения по имени сервиса, а не localhost: True
~~~

Все переменные со специальным префиксом `ASPNETCORE_` попадают в конфигурацию хоста без префикса: `ASPNETCORE_HTTP_PORTS=8080` — это ключ `HTTP_PORTS`, которым Kestrel выбирает порты. Именно так образы .NET 8+ слушают порт `8080` (а не `80`), потому что процесс запускается без прав суперпользователя и не может занять привилегированный порт. Остальные переменные читаются через общий провайдер: **последний источник побеждает**, поэтому переменная окружения переопределяет значение из `appsettings.json` (мы показывали слои в теме про [хостинг](#p4-hosting)).

### Шаг 4. Dockerfile — многоэтапная сборка

~~~dockerfile Dockerfile (в корне решения) @nocheck
# Этап 1: сборка. Образ SDK большой, но в итоговый образ он не попадёт.
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

# Сначала только файлы проектов → restore кэшируется, пока зависимости не меняются
COPY TaskBoard.sln .
COPY TaskBoard.Api/TaskBoard.Api.csproj TaskBoard.Api/
COPY TaskBoard.Application/TaskBoard.Application.csproj TaskBoard.Application/
COPY TaskBoard.Domain/TaskBoard.Domain.csproj TaskBoard.Domain/
COPY TaskBoard.Infrastructure/TaskBoard.Infrastructure.csproj TaskBoard.Infrastructure/
RUN dotnet restore TaskBoard.Api/TaskBoard.Api.csproj

# Потом весь исходный код
COPY . .
RUN dotnet publish TaskBoard.Api/TaskBoard.Api.csproj -c Release -o /app/publish --no-restore

# Этап 2: рантайм — маленький образ только с ASP.NET Core
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS final
WORKDIR /app
COPY --from=build /app/publish .
USER $APP_UID                       # не root: в образах .NET 8+ такой пользователь уже создан
EXPOSE 8080
ENTRYPOINT ["dotnet", "TaskBoard.Api.dll"]
~~~

:::info Версия образа
Тег образа (`10.0`) должен совпадать с `TargetFramework` проекта (`net10.0`). Если проект на `net8.0` — используй `sdk:8.0` и `aspnet:8.0`. Начиная с .NET 8 контейнерные образы по умолчанию слушают порт **8080**.
:::

Прочитай файл построчно. `FROM … AS build` начинает первый этап на образе SDK. `WORKDIR` задаёт рабочую папку. `COPY` кладёт файлы в образ. Сначала копируются только `.csproj` и выполняется `restore` — Docker кэширует результат каждой инструкции как слой, и пока проектные файлы не изменились, восстановление пакетов не повторяется. Затем копируется весь код и выполняется `publish`. Второй этап стартует с чистого образа рантайма и забирает из первого только папку с результатом публикации. `EXPOSE` лишь документирует порт — наружу порт открывает `ports` в compose или `-p` в `docker run`. `ENTRYPOINT` в форме массива запускает процесс напрямую (без оболочки), что нужно для корректной остановки.

~~~text .dockerignore
**/bin/
**/obj/
**/.vs/
**/.idea/
.git/
*.user
.env
~~~

Файл `.dockerignore` не даёт `COPY . .` затащить в образ артефакты сборки, историю git и секреты из `.env`; он ускоряет сборку и не позволяет случайно упаковать пароль.

### Шаг 5. docker-compose: API + PostgreSQL одной командой

~~~yaml compose.yaml @nocheck
services:
  db:
    image: postgres:16
    environment:
      POSTGRES_USER: app
      POSTGRES_PASSWORD: app_dev_password
      POSTGRES_DB: taskboard
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U app -d taskboard"]
      interval: 5s
      timeout: 3s
      retries: 10

  api:
    build: .
    depends_on:
      db:
        condition: service_healthy        # ждать, пока база реально готова принимать соединения
    environment:
      ASPNETCORE_ENVIRONMENT: Development
      ConnectionStrings__Default: "Host=db;Port=5432;Database=taskboard;Username=app;Password=app_dev_password"
      Jwt__Key: ${JWT_KEY:?задай переменную JWT_KEY в файле .env}
    ports:
      - "8080:8080"

volumes:
  pgdata:
~~~

~~~bash Запуск @nocheck
echo "JWT_KEY=$(openssl rand -base64 48)" > .env      # .env — в .gitignore
docker compose up --build                            # та самая «одна команда»
~~~

Внутри сети compose сервисы обращаются друг к другу **по имени сервиса**: `Host=db`, а не `localhost` (внутри контейнера `localhost` — это он сам). Строка `"8080:8080"` означает «порт хоста : порт контейнера». Пароль базы в `compose.yaml` — допустимо для локальной разработки; настоящие секреты передаются через `.env` или хранилище секретов и не коммитятся. Конструкция `${JWT_KEY:?…}` заставляет compose остановиться с понятным сообщением, если переменная не задана, вместо того чтобы запустить API с пустым ключом.

Данные базы лежат в **томе** `pgdata`: контейнер можно удалить и пересоздать, а данные сохранятся. Команда `docker compose down` удаляет контейнеры и сеть, но оставляет том; `docker compose down -v` удалит и данные.

### Шаг 6. Проверка работоспособности (health checks)

`depends_on` с `service_healthy` ждёт, пока в базе сработает проверка. Для API то же самое делается встроенными проверками ASP.NET Core: эндпоинт отвечает `200 Healthy`, если зависимости в порядке, и `503 Unhealthy`, если нет. Его используют оркестраторы и балансировщики, чтобы не направлять трафик на неработающий экземпляр. Проверим на сервере, который «теряет» базу на лету:

~~~csharp
using Microsoft.Extensions.Diagnostics.HealthChecks;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;

var builder = WebApplication.CreateBuilder();
builder.WebHost.UseUrls("http://127.0.0.1:0");
builder.Logging.ClearProviders();
builder.Services.AddHealthChecks()
    .AddCheck("db", () => Db.Up ? HealthCheckResult.Healthy() : HealthCheckResult.Unhealthy("нет соединения с базой"));
var app = builder.Build();
app.MapHealthChecks("/health");

await app.StartAsync();
using var http = new HttpClient { BaseAddress = new Uri(app.Urls.First()) };

async Task Check(string label)
{
    var r = await http.GetAsync("/health");
    Console.WriteLine($"{label,-22} → {(int)r.StatusCode} {await r.Content.ReadAsStringAsync()}");
}

await Check("база работает");
Db.Up = false;
await Check("база пропала");
Db.Up = true;
await Check("база вернулась");

var timeout = app.Services.GetRequiredService<IOptions<HostOptions>>().Value.ShutdownTimeout;
Console.WriteLine($"Время на корректную остановку по умолчанию: {timeout.TotalSeconds} с");
await app.StopAsync();

static class Db { public static bool Up = true; }
~~~
~~~console
база работает          → 200 Healthy
база пропала           → 503 Unhealthy
база вернулась         → 200 Healthy
Время на корректную остановку по умолчанию: 30 с
~~~

Последняя строка важна для контейнеров: при остановке Docker посылает процессу сигнал `SIGTERM`, и хост ASP.NET Core начинает корректное завершение (дожидается текущих запросов). Если процесс не завершился за отведённое время (по умолчанию у `docker stop` — 10 секунд), Docker убьёт его принудительно. Поэтому долгие операции в обработчиках нужно прерывать по `CancellationToken`, а `ENTRYPOINT` запускать без оболочки-посредника, которая может не передать сигнал.

### Шаг 7. Миграции при старте (для разработки)

~~~csharp Program.cs @nocheck
if (app.Environment.IsDevelopment())
{
    using var scope = app.Services.CreateScope();
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    db.Database.Migrate();      // применить неприменённые миграции
}
~~~

Для учебного проекта это удобно: `docker compose up` сразу даёт рабочую базу. На проде миграции применяют отдельным шагом развёртывания (SQL-скрипт или `dotnet ef migrations bundle`), а не при старте каждого экземпляра приложения: два экземпляра, стартующие одновременно, будут конкурировать за изменения схемы (подробнее — в теме про [миграции](#p3-migrations)).

## Как это работает под капотом

- **Слои образа.** Каждая инструкция Dockerfile (`COPY`, `RUN`) создаёт слой — неизменяемый набор изменений файловой системы. Слои кэшируются и переиспользуются; при изменении инструкции пересобираются она и все последующие. Поэтому порядок «редко меняющееся — первым, часто меняющееся — последним» (сначала `.csproj` и `restore`, потом исходники) ускоряет сборку в разы.
- **Образ и контейнер.** Контейнер — не виртуальная машина: это обычный процесс Linux, изолированный средствами ядра (пространства имён, контрольные группы). Он использует ядро хоста, поэтому стартует за доли секунды и весит мало. Поверх слоёв образа контейнер получает тонкий слой для записи, который исчезает вместе с контейнером — отсюда необходимость томов для данных.
- **Многоэтапная сборка.** Каждый `FROM` начинает новый этап; в итоговый образ попадает только то, что явно скопировано через `COPY --from`. Образ SDK (компиляторы, NuGet-кэш, исходники) остаётся в промежуточном этапе, а итоговый образ содержит только рантайм и опубликованные файлы — он меньше и безопаснее (меньше пакетов, меньше уязвимостей). Размеры сравни сам командой `docker images`: это пункт практики.
- **Сеть compose.** Compose создаёт отдельную сеть и встроенный DNS: имя сервиса (`db`) резолвится в адрес контейнера. Порты других контейнеров этой сети доступны без публикации; `ports` нужен только для доступа с хоста.
- **`depends_on` и готовность.** Без `condition: service_healthy` compose ждёт лишь *запуска* контейнера базы, а не её готовности принимать соединения, и API падает при старте. Условие по health check устраняет эту гонку; альтернатива — повторные попытки подключения в самом приложении.
- **Откуда приложение берёт настройки.** Конфигурация — это цепочка провайдеров (JSON-файлы, переменные окружения, аргументы командной строки); у последнего приоритет. Переменные compose попадают в окружение процесса и читаются провайдером переменных окружения, поэтому один и тот же образ работает и в разработке, и на проде.
- **Как строится OpenAPI-документ.** Генератор берёт `EndpointDataSource` (те самые метаданные, что мы напечатали), для типов запросов и ответов строит JSON Schema по правилам `System.Text.Json`, собирает документ и отдаёт по `/openapi/v1.json`. Трансформеры документа и операций позволяют дополнить его (описание, схемы безопасности).
- **Среда выполнения знает про контейнер.** .NET читает лимиты памяти и процессора из контрольных групп: сборщик мусора и пул потоков подстраиваются под выделенные ресурсы, а не под всю машину.
- **Сигналы.** Процесс в контейнере — PID 1; остановка начинается с `SIGTERM`, а хост ASP.NET Core превращает его в штатное завершение. Время на него ограничено (мы вывели значение выше).

## Типичные ошибки и ловушки

- **`localhost` в строке подключения внутри контейнера.** Он указывает на сам контейнер API; нужно имя сервиса (`db`).
- **Секреты в образе или в git.** Пароли и ключи, упакованные в образ или закоммиченные, остаются в слоях навсегда; передавай их переменными окружения, `.env` (вне git) или хранилищем секретов.
- **`COPY . .` до `restore`.** Любая правка кода сбрасывает кэш пакетов, сборка идёт минуты.
- **Нет `.dockerignore`.** В контекст сборки попадают `bin`, `obj`, `.git`, `.env` — медленно и опасно.
- **Образ SDK как итоговый.** Образ в разы больше и содержит инструменты сборки, не нужные на проде.
- **Несовпадение версии образа и проекта.** `net10.0` в проекте и `aspnet:8.0` в Dockerfile — приложение не запустится.
- **API стартует раньше базы.** Без health check и `service_healthy` первые запуски падают «случайно».
- **Данные пропали после пересоздания.** База без тома хранит файлы в контейнере; `docker compose down -v` или удаление контейнера стирает их.
- **Контейнер запущен от root.** Лучше `USER $APP_UID`; тогда уязвимость в приложении даёт меньше прав.
- **Порт опубликован «на весь мир».** `5432:5432` открывает базу на всех интерфейсах; для учебного проекта допустимо, для общего сервера — нет (можно `127.0.0.1:5432:5432`).
- **Миграции на старте на проде.** Конкуренция экземпляров, долгий старт; применяйте отдельным шагом.
- **Документ OpenAPI «врёт».** Эндпоинт без `Produces` и без типизированных результатов описан неполно; проверяй документ глазами.
- **Swagger на проде без защиты.** Документация раскрывает всю поверхность API; включай её в `Development` или закрывай авторизацией.

## Вопросы с собеседований

:::spoiler Зачем многоэтапная сборка в Dockerfile?
SDK нужен только для сборки. Итоговый образ на базе `aspnet` содержит лишь рантайм и опубликованные файлы — он в разы меньше и с меньшей поверхностью атаки.
:::

:::spoiler Почему из контейнера API строка подключения содержит Host=db, а не localhost?
Внутри контейнера `localhost` — это сам контейнер API. Compose создаёт сеть, где сервисы доступны по именам.
:::

:::spoiler Зачем копировать .csproj отдельно перед COPY . .?
Слои Docker кэшируются. `dotnet restore` пересчитается только при изменении файлов проектов, а не при каждой правке кода — сборка заметно быстрее.
:::

:::spoiler Чем образ отличается от контейнера?
Образ — неизменяемый шаблон из слоёв (как класс). Контейнер — запущенный экземпляр образа с тонким слоем для записи (как объект). Из одного образа запускают много контейнеров.
:::

:::spoiler Чем контейнер отличается от виртуальной машины? (ловушка: «это маленькая ВМ»)
Контейнер использует ядро хоста и является изолированным процессом, а не отдельной операционной системой; поэтому он лёгкий и быстро стартует. ВМ несёт собственное ядро и эмулирует железо.
:::

:::spoiler Что делает `EXPOSE 8080` в Dockerfile? (ловушка: «открывает порт наружу»)
Только документирует порт, на котором слушает приложение. Опубликовать порт на хосте можно через `ports` в compose или `-p` в `docker run`.
:::

:::spoiler Как передать секрет в контейнер, не зашивая его в образ?
Переменными окружения при запуске (в compose — из файла `.env`, не попадающего в git), секретами оркестратора или хранилищем секретов. Секрет, попавший в слой образа, остаётся в нём навсегда.
:::

:::spoiler Откуда берётся документ OpenAPI?
Генерируется из метаданных эндпоинтов (маршруты, методы, типы запроса и ответа, коды ответов, авторизация), поэтому актуален, пока метаданные точны.
:::

:::spoiler Зачем health check в compose, если есть `depends_on`?
Без условия `service_healthy` `depends_on` ждёт только запуска контейнера, а не готовности сервиса, и API может стартовать, пока база ещё не принимает соединения.
:::

## Что запомнить

- Docker упаковывает приложение вместе с окружением: образ — шаблон, контейнер — запущенный экземпляр.
- Многоэтапный Dockerfile: сборка на образе SDK, итог на образе `aspnet`; `.csproj` + `restore` копируются раньше исходников ради кэша слоёв.
- Версия образа совпадает с `TargetFramework`; образы .NET 8+ слушают `8080` и запускаются не от root.
- В compose сервисы общаются по имени сервиса; `ports` нужен только для доступа с хоста; данные базы живут в томе.
- Настройки приходят переменными окружения (`Раздел__Ключ`); секреты не коммитятся и не упаковываются в образ.
- `depends_on` с `service_healthy` и health check решают гонку «API раньше базы».
- OpenAPI-документ строится из метаданных эндпоинтов — проверяй его глазами и описывай ответы (`Produces`, `TypedResults`).
- `.http`-файл — быстрая воспроизводимая проверка сценария прямо в репозитории.

## Практика

- [ ] Подключил OpenAPI-документ и UI, проверил, что все эндпоинты описаны с кодами ответов
- [ ] Написал `.http`-файл со сценарием: регистрация → логин → CRUD → ошибки
- [ ] Написал Dockerfile и `compose.yaml`; `docker compose up --build` на чистой машине поднимает API и базу
- [ ] Проверил размер образа (`docker images`) и сравнил с образом SDK

