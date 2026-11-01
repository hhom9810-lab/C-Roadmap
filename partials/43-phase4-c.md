@@page id="p4-project" phase="4" kind="project" title="Проект фазы: REST API для портфолио" nav="Проект: REST API" est="~2 месяца"
:::why
Это **первый серьёзный проект для портфолио**: по нему работодатель будет судить, умеешь ли ты писать backend. Поэтому важны не только функции, но и структура, README и то, насколько легко его запустить постороннему человеку.
:::

## Выбор темы

Выбери **одну** тему из трёх (или свою сопоставимой сложности). Ниже — эталонный вариант «Task management», на его примере написаны все темы фазы.

| Тема | Сущности (минимум 4–5) | Бизнес-логика сверх CRUD |
|---|---|---|
| **Task management** | User, Project, ProjectMember, TaskItem, Comment, Tag | роли в проекте, жизненный цикл задачи, назначение, дедлайны и просрочки, история изменений |
| **Job board** | User, Company, Vacancy, Application, Resume, Skill | статусы отклика, модерация вакансий, поиск по навыкам и зарплате, лимит откликов |
| **E-commerce backend** | User, Category, Product, Cart, Order, OrderItem | остатки на складе, оформление заказа в транзакции, статусы заказа, отмена с возвратом остатков |

## Требования (эталон: Task management)

### Функциональные

- [ ] Регистрация и вход (JWT); роли системы: `Admin`, `Member`
- [ ] Проекты: создание, участники с ролями в проекте (`Owner`, `Manager`, `Member`), приглашение по email
- [ ] Задачи: CRUD, фильтры (статус, исполнитель, тег, просроченные), сортировка, пагинация
- [ ] Жизненный цикл: `Todo → InProgress → Done`, переходы через действия (`POST /tasks/{id}/start`, `/complete`, `/reopen`) с проверкой правил
- [ ] Назначение исполнителя — только участнику проекта
- [ ] Комментарии к задачам; редактировать и удалять можно только свои
- [ ] Права: участник видит только свои проекты; менять состав проекта может `Owner`/`Manager`
- [ ] Статистика проекта: задачи по статусам, просроченные, топ исполнителей (один SQL-запрос, без N+1)

### Технические

- [ ] 4 проекта: Api, Application, Domain, Infrastructure; правила — в домене
- [ ] EF Core + PostgreSQL + миграции отдельными коммитами
- [ ] DTO на всех входах и выходах, валидация (FluentValidation или DataAnnotations)
- [ ] Глобальная обработка ошибок → ProblemDetails; доменные исключения → 404/403/409/422
- [ ] Serilog со структурированными логами и request logging
- [ ] OpenAPI-документ + UI в Development; `.http`-файл со сценариями
- [ ] Dockerfile + `compose.yaml`: `docker compose up --build` поднимает всё
- [ ] Минимум 10–15 unit-тестов на доменные правила (xUnit; подробно — Фаза 5)
- [ ] Асинхронный код везде (`async`/`await`, `CancellationToken` в эндпоинтах)

## План по неделям

| Недели | Что делаешь | Темы фазы |
|---|---|---|
| 1–2 | Решение из 4 проектов, домен, первые эндпоинты на памяти | HTTP/REST, хост, эндпоинты |
| 3 | Middleware, DI, EF Core + первые миграции | middleware, DI |
| 4–5 | Все сущности, связи, DTO, маппинг, пагинация | архитектура |
| 6 | Валидация, обработка ошибок, логирование | валидация, ошибки |
| 7–8 | Регистрация, логин, роли, права на ресурсы | auth |
| 9 | Статистика, охота на N+1, первые тесты | повторение Фазы 3 |
| 10 | Docker, OpenAPI, README, демо-сценарий | OpenAPI и Docker |

## Граничные случаи, которые должен пройти API

- [ ] Невалидное тело (пустое название, слишком длинное, дата в прошлом) → 400 с полями
- [ ] Несуществующий id → 404 в формате ProblemDetails
- [ ] Чужой проект → 404 или 403 (реши и обоснуй в README: 404 не раскрывает факт существования)
- [ ] Закрыть уже закрытую задачу → 409
- [ ] Назначить исполнителем не участника проекта → 422
- [ ] Регистрация с занятым email (в т.ч. два одновременных запроса) → 409, в базе одна запись
- [ ] Запрос без токена → 401; с токеном без роли → 403; с истёкшим токеном → 401
- [ ] `pageSize=100000` → ограничен максимумом из настроек
- [ ] Удаление проекта с задачами — поведение явно определено (каскад или запрет) и описано
- [ ] Ошибка-баг (исключение в коде) → 500 без деталей реализации, с `traceId`; полная ошибка в логе

## README — часть навыка, не формальность

~~~text Структура README
# TaskBoard API
Одно предложение: что это и для кого.

## Возможности           — список функций и бизнес-правил
## Архитектура           — схема слоёв (картинка), почему так
## Модель данных         — ER-диаграмма
## Запуск                — docker compose up --build; какие переменные задать в .env
## API                   — ссылка на OpenAPI UI, примеры запросов из .http
## Тесты                 — как запустить, что покрыто
## Решения и компромиссы — что сознательно не сделано (refresh-токены, кэш...) и почему
~~~

:::tip Схема в README
Диаграмму слоёв и ER-диаграмму можно нарисовать в draw.io (diagrams.net) или прямо в README на Mermaid — GitHub отображает Mermaid-блоки как картинки.
:::

## Подсказки

:::spoiler Пагинация одним запросом
~~~csharp
public sealed record PagedResponse<T>(IReadOnlyList<T> Items, int Page, int PageSize, int TotalCount);

public async Task<PagedResponse<TaskResponse>> ListAsync(int projectId, TaskFilter f, int page, int pageSize, CancellationToken ct)
{
    IQueryable<TaskItem> q = _db.Tasks.Where(t => t.ProjectId == projectId);
    if (f.Status is { } status) q = q.Where(t => t.Status == status);
    if (f.AssigneeId is { } assignee) q = q.Where(t => t.AssigneeId == assignee);

    int total = await q.CountAsync(ct);
    var items = await q.OrderBy(t => t.Id)
        .Skip((page - 1) * pageSize).Take(pageSize)
        .Select(t => new TaskResponse(t.Id, t.Title, t.Status.ToString(), t.AssigneeId, t.CompletedAt))
        .ToListAsync(ct);

    return new PagedResponse<TaskResponse>(items, page, pageSize, total);
}
~~~

Два SQL-запроса (`COUNT` и страница) — нормально. Важно, что оба выполняются в базе, а сортировка стабильна (по уникальному ключу), иначе записи «прыгают» между страницами.
:::

:::spoiler Текущий пользователь как сервис
~~~csharp
public interface ICurrentUser
{
    int Id { get; }
    bool IsInRole(string role);
}

public sealed class HttpCurrentUser(IHttpContextAccessor accessor) : ICurrentUser
{
    private ClaimsPrincipal User => accessor.HttpContext?.User ?? throw new InvalidOperationException("Нет HTTP-контекста");
    public int Id => int.Parse(User.FindFirst("sub")?.Value ?? throw new UnauthorizedAccessException());
    public bool IsInRole(string role) => User.IsInRole(role);
}

// builder.Services.AddHttpContextAccessor();
// builder.Services.AddScoped<ICurrentUser, HttpCurrentUser>();   // Scoped — относится к запросу!
~~~

Сервисы Application зависят от `ICurrentUser`, а не от `HttpContext`: их можно тестировать без HTTP, подставив фейковую реализацию.
:::

:::key Проверка перед тем, как отметить критерии фазы
- [ ] На чистой машине (или в новой папке после `git clone`) `docker compose up --build` поднимает работающий API
- [ ] В заметках есть «мой баг с lifetime» для второго пункта критерия
- [ ] README по структуре выше, со схемой архитектуры
- [ ] Проект закреплён в GitHub-профиле
:::

