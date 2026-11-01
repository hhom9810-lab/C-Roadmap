@@append id="p4-http"
## Закрепление {#lab}

:::quiz HTTP и REST
? Какой метод идемпотентен: многократный вызов даёт тот же результат, что и один? #web
- POST
+ PUT
- PATCH (всегда)
- Ни один
= `PUT /users/5` с теми же данными — то же состояние. Повторный `POST` создаёт новый ресурс, потому не идемпотентен.

? Какой статус вернуть при создании ресурса через POST? #web
- 200 OK
+ 201 Created + заголовок Location
- 204 No Content
- 302 Found
= 201 сообщает, что ресурс создан, а `Location` — где его найти.

? В чём разница между 401 и 403? #web
+ 401 — не аутентифицирован (кто ты?); 403 — аутентифицирован, но прав нет
- Ничем
- 401 для ошибок сервера
- 403 для ошибок формата
= Частая путаница в API.

? Клиент отправил некорректный JSON. Правильный ответ? #web
+ 400 Bad Request (или 422 для валидации смысла)
- 500 Internal Server Error
- 404 Not Found
- 200 с текстом ошибки
= 5xx — только про сбой сервера. Ошибки клиента — 4xx.

? Какой URL лучше соответствует REST? #web
- `POST /createUser`
+ `POST /users`
- `GET /getUsers`
- `POST /users/delete/5`
= Ресурсы — существительные во множественном числе; действие задаёт HTTP-метод.
:::

:::cards HTTP
Идемпотентность :: GET, PUT, DELETE — повтор не меняет итог; POST — нет.
Статусы :: 2xx успех, 3xx перенаправление, 4xx вина клиента, 5xx вина сервера.
401 vs 403 :: 401 — кто ты? 403 — тебе нельзя.
REST URL :: Существительные во множественном числе + HTTP-метод как действие.
:::


@@append id="p4-hosting"
## Закрепление {#lab}

:::quiz Хост и конфигурация
? Где хранить пароль к базе данных при локальной разработке? #web
+ User Secrets (или переменные окружения) — вне репозитория
- В appsettings.json в git
- В коде константой
- В README
= Пароли в репозитории попадают в историю навсегда — даже после удаления файла.

? В каком порядке наслаиваются источники конфигурации (от слабого к сильному)? #web
+ appsettings.json → appsettings.{Environment}.json → user secrets → переменные окружения → командная строка
- Переменные окружения → appsettings.json
- Только appsettings.json
- Порядок случайный
= Более поздний источник перекрывает ранний — поэтому в Docker настройки задают переменными окружения.
:::

:::cards Конфигурация
Слои конфигурации :: appsettings → appsettings.{Env} → user secrets → env → аргументы.
Секреты :: User Secrets / переменные окружения / хранилище секретов — не git.
:::


@@append id="p4-endpoints"
## Закрепление {#lab}

:::quiz Эндпоинты
? Что делает атрибут `[ApiController]`? #web
+ Включает автоматическую валидацию модели (400), привязку из тела, ProblemDetails для ошибок
- Включает кэширование
- Включает авторизацию
- Запускает контроллер в отдельном потоке
= Не нужно вручную проверять `ModelState.IsValid`.

? Как лучше возвращать результат из метода контроллера? #web
+ `ActionResult<T>`/`IActionResult` — чтобы явно управлять статус-кодом
- Всегда `object`
- Всегда `void`
- `string` с описанием
= `return NotFound();`, `return Ok(dto);`, `return CreatedAtAction(...)`.
:::

:::cards Эндпоинты
[ApiController] :: Авто-валидация, привязка из тела, ProblemDetails.
ActionResult<T> :: Явный статус-код плюс типизированное тело.
:::


@@append id="p4-middleware"
## Закрепление {#lab}

:::quiz Middleware
? Почему порядок `UseAuthentication()` и `UseAuthorization()` важен? #web
+ Сначала нужно определить, кто пользователь, и только потом проверять его права
- Порядок не важен
- Так быстрее
- Требование Swagger
= Каждый middleware видит запрос в порядке регистрации, а ответ — в обратном.

? Что значит «короткое замыкание» в pipeline? #web
+ Middleware не вызывает `next` и сам формирует ответ — следующие этапы не выполняются
- Падение приложения
- Перегрев сервера
- Закрытие соединения с БД
= Так работают, например, UseHttpsRedirection и обработчик ошибок авторизации.
:::

:::ide Свой pipeline из middleware
@xp 90
@task
Реализуй мини-конвейер `Pipeline`:
- `Use(Action<List<string>, Action> middleware)` — добавляет этап; этап получает «контекст» (список строк-логов) и `next`;
- `Run(List<string> log)` — запускает цепочку по порядку регистрации; последний `next` ничего не делает.

Если этап не вызывает `next`, следующие этапы не выполняются.
@code
~~~csharp
using System;
using System.Collections.Generic;

public class Pipeline
{
    public void Use(Action<List<string>, Action> middleware)
    {
        // TODO
    }

    public void Run(List<string> log)
    {
        // TODO
    }
}
~~~
@tests
~~~csharp
class T
{
    public static void Run()
    {
        var p = new Pipeline();
        p.Use((log, next) => { log.Add("A>"); next(); log.Add("<A"); });
        p.Use((log, next) => { log.Add("B>"); next(); log.Add("<B"); });
        var l = new List<string>();
        p.Run(l);
        Assert.Equal(new List<string> { "A>", "B>", "<B", "<A" }, l, "вложенный порядок");

        var q = new Pipeline();
        q.Use((log, next) => { log.Add("auth"); });
        q.Use((log, next) => { log.Add("never"); next(); });
        var l2 = new List<string>();
        q.Run(l2);
        Assert.Equal(new List<string> { "auth" }, l2, "короткое замыкание");

        var empty = new List<string>();
        new Pipeline().Run(empty);
        Assert.Equal(0, empty.Count, "пустой конвейер");
    }
}
~~~
@hint
Храни `List<Action<List<string>, Action>>`. В `Run` заведи локальную функцию `void Step(int i)`: если `i < _mw.Count`, вызови `_mw[i](log, () => Step(i + 1))`.
@solution
~~~csharp
using System;
using System.Collections.Generic;

public class Pipeline
{
    private readonly List<Action<List<string>, Action>> _mw = new List<Action<List<string>, Action>>();

    public void Use(Action<List<string>, Action> middleware) => _mw.Add(middleware);

    public void Run(List<string> log)
    {
        void Step(int i)
        {
            if (i >= _mw.Count) return;
            _mw[i](log, () => Step(i + 1));
        }
        Step(0);
    }
}
~~~
@why
Именно так устроен ASP.NET Core: `next` — это «остаток цепочки» (`RequestDelegate`). Поэтому код до `next()` видит запрос, после — ответ, а отсутствие вызова `next` прерывает конвейер.
:::

:::cards Middleware
Pipeline :: Запрос идёт через middleware по порядку, ответ — в обратном.
next :: Делегат «остаток цепочки»; не вызвал — запрос не пойдёт дальше.
Порядок :: ExceptionHandler → HTTPS → Routing → AuthN → AuthZ → Endpoints.
:::


@@append id="p4-di"
## Закрепление {#lab}

:::quiz Dependency Injection
? Singleton-сервис принимает в конструкторе Scoped-сервис (например, DbContext). Что не так? #web
+ «Пленённая» зависимость (captive dependency): Scoped живёт столько же, сколько синглтон — устаревшее состояние и гонки
- Ничего
- Не скомпилируется
- Это ускорит приложение
= ASP.NET Core в Development может бросить исключение при проверке областей (ValidateScopes).

? Какое время жизни выбрать для сервиса без состояния (калькулятор налогов)? #web
+ Singleton или Transient — состояния нет, безопасно и то и другое
- Только Scoped
- Любое, но обязательно Scoped
- Ни одно
= Singleton экономит аллокации, если сервис потокобезопасен.

? Что делает Transient? #web
+ Создаёт новый экземпляр при каждом запросе зависимости
- Один экземпляр на приложение
- Один экземпляр на HTTP-запрос
- Не создаёт экземпляр
= Scoped — один экземпляр на scope (обычно HTTP-запрос).

? Что такое Service Locator и почему его считают антипаттерном? #oop
+ Класс сам «достаёт» зависимости из контейнера через `serviceProvider.GetService`, скрывая свои зависимости
- Внедрение через конструктор
- Паттерн «фабрика»
- Регистрация сервисов
= Зависимости должны быть видны в конструкторе.
:::

:::ide Мини-контейнер зависимостей
@xp 100
@task
Реализуй `Container` с двумя жизненными циклами:
- `RegisterSingleton(string name, Func<object> factory)` — фабрика вызывается **один раз**, дальше возвращается тот же объект;
- `RegisterTransient(string name, Func<object> factory)` — каждый `Resolve` создаёт новый объект;
- `Resolve(string name)` — вернуть объект; для незарегистрированного имени бросить `InvalidOperationException`.
@code
~~~csharp
using System;
using System.Collections.Generic;

public class Container
{
    public void RegisterSingleton(string name, Func<object> factory) { }
    public void RegisterTransient(string name, Func<object> factory) { }

    public object Resolve(string name)
    {
        throw new NotImplementedException();
    }
}
~~~
@tests
~~~csharp
class T
{
    class Service { }

    public static void Run()
    {
        int made = 0;
        var c = new Container();
        c.RegisterSingleton("single", () => { made++; return new Service(); });
        c.RegisterTransient("trans", () => new Service());

        var a = c.Resolve("single");
        var b = c.Resolve("single");
        Assert.True(object.ReferenceEquals(a, b), "singleton — один объект");
        Assert.Equal(1, made, "фабрика singleton вызвана один раз");

        var x = c.Resolve("trans");
        var y = c.Resolve("trans");
        Assert.False(object.ReferenceEquals(x, y), "transient — каждый раз новый");

        Assert.Throws<InvalidOperationException>(() => c.Resolve("nope"));
    }
}
~~~
@hint
Для каждой записи хранишь фабрику, флаг singleton и кэш-объект. Для singleton: если кэш пуст — вызови фабрику и запомни.
@solution
~~~csharp
using System;
using System.Collections.Generic;

public class Container
{
    private class Entry
    {
        public Func<object> Factory;
        public bool Singleton;
        public object Instance;
    }

    private readonly Dictionary<string, Entry> _map = new Dictionary<string, Entry>();

    public void RegisterSingleton(string name, Func<object> factory) =>
        _map[name] = new Entry { Factory = factory, Singleton = true };

    public void RegisterTransient(string name, Func<object> factory) =>
        _map[name] = new Entry { Factory = factory, Singleton = false };

    public object Resolve(string name)
    {
        if (!_map.TryGetValue(name, out var e))
            throw new InvalidOperationException("Не зарегистрировано: " + name);
        if (!e.Singleton) return e.Factory();
        if (e.Instance == null) e.Instance = e.Factory();
        return e.Instance;
    }
}
~~~
@why
Контейнер — это словарь «имя → как создать» плюс кэш для синглтонов. Потокобезопасный Singleton в реальном контейнере требует блокировки (или `Lazy<T>`) — вспомни это, когда дойдёшь до многопоточности.
:::

:::cards DI
Singleton :: Один экземпляр на приложение; должен быть потокобезопасным.
Scoped :: Один экземпляр на HTTP-запрос (DbContext).
Transient :: Новый экземпляр при каждом запросе зависимости.
Captive dependency :: Singleton держит Scoped — зависимость «застревает» и устаревает.
:::


@@append id="p4-architecture"
## Закрепление {#lab}

:::quiz Слои, DTO, маппинг
? Почему контроллер не должен напрямую работать с `DbContext`? #oop
+ Смешиваются HTTP и работа с данными: логику нельзя переиспользовать и тестировать без БД
- Это запрещено фреймворком
- Контроллер не может создавать запросы
- DbContext медленный
= Контроллер — тонкий адаптер: принял запрос → вызвал сервис → вернул ответ.

? Зачем нужны отдельные DTO для запроса и ответа? #web
+ Контракт API не привязан к схеме БД; можно скрыть поля (пароль) и защититься от over-posting
- DTO быстрее сериализуются
- Это требование Swagger
- Чтобы увеличить объём кода
= Over-posting: клиент присылает лишнее поле `IsAdmin`, и оно попадает в сущность.
:::

:::ide Маппинг без утечки лишних полей
@xp 70
@task
Дана сущность `User` с полем `PasswordHash`. Реализуй:
- `UserDto Solver.ToDto(User u)` — без `PasswordHash`; `FullName` = `FirstName + " " + LastName`;
- `User Solver.FromRequest(CreateUserRequest r)` — создаёт пользователя с `IsAdmin = false` независимо от запроса и с пустым `PasswordHash` (хэширование — в другом слое).
@code
~~~csharp
using System;

public class User
{
    public int Id { get; set; }
    public string FirstName { get; set; }
    public string LastName { get; set; }
    public string PasswordHash { get; set; }
    public bool IsAdmin { get; set; }
}

public class UserDto
{
    public int Id { get; set; }
    public string FullName { get; set; }
}

public class CreateUserRequest
{
    public string FirstName { get; set; }
    public string LastName { get; set; }
    public bool IsAdmin { get; set; }
}

public static class Solver
{
    public static UserDto ToDto(User u)
    {
        throw new NotImplementedException();
    }

    public static User FromRequest(CreateUserRequest r)
    {
        throw new NotImplementedException();
    }
}
~~~
@tests
~~~csharp
class T
{
    public static void Run()
    {
        var u = new User { Id = 7, FirstName = "Иван", LastName = "Петров", PasswordHash = "xxx", IsAdmin = true };
        var dto = Solver.ToDto(u);
        Assert.Equal(7, dto.Id, "Id");
        Assert.Equal("Иван Петров", dto.FullName, "FullName");

        var created = Solver.FromRequest(new CreateUserRequest { FirstName = "А", LastName = "Б", IsAdmin = true });
        Assert.False(created.IsAdmin, "over-posting: IsAdmin из запроса игнорируется");
        Assert.Equal("А", created.FirstName, "имя");
        Assert.Equal("", created.PasswordHash, "хэш пока пуст");
    }
}
~~~
@hint
`PasswordHash = ""`, `IsAdmin = false` — задавай явно, не копируй из запроса.
@solution
~~~csharp
using System;

public class User
{
    public int Id { get; set; }
    public string FirstName { get; set; }
    public string LastName { get; set; }
    public string PasswordHash { get; set; }
    public bool IsAdmin { get; set; }
}

public class UserDto
{
    public int Id { get; set; }
    public string FullName { get; set; }
}

public class CreateUserRequest
{
    public string FirstName { get; set; }
    public string LastName { get; set; }
    public bool IsAdmin { get; set; }
}

public static class Solver
{
    public static UserDto ToDto(User u) =>
        new UserDto { Id = u.Id, FullName = u.FirstName + " " + u.LastName };

    public static User FromRequest(CreateUserRequest r) =>
        new User { FirstName = r.FirstName, LastName = r.LastName, PasswordHash = "", IsAdmin = false };
}
~~~
@why
Маппинг — граница доверия. Копируй в сущность только то, что разрешено; опасные поля (права, роли, цены) выставляй на сервере. Ручной маппинг на пару полей надёжнее «магического» AutoMapper'а.
:::

:::cards Слои
Controller :: Тонкий: HTTP ⇄ вызов сервиса.
Service :: Бизнес-логика, не знает про HTTP.
DTO :: Контракт API, независимый от схемы БД; защита от over-posting.
:::


@@append id="p4-validation"
## Закрепление {#lab}

:::quiz Валидация
? Почему нельзя полагаться только на валидацию на клиенте? #web
+ Клиента можно обойти (curl, Postman) — сервер обязан проверять сам
- Клиентская валидация запрещена
- Она медленная
- Браузеры её игнорируют
= Серверная валидация — единственная граница доверия.

? Какой статус вернуть при ошибках валидации? #web
+ 400 Bad Request (или 422) с описанием ошибок по полям
- 500
- 200
- 404
= С `[ApiController]` это происходит автоматически (ValidationProblemDetails).
:::

:::ide Валидатор регистрации
@xp 80
@task
Реализуй `Solver.Validate(RegisterRequest r)` → `Dictionary<string, List<string>>` (поле → список ошибок). Пустой словарь = всё хорошо.

Правила:
- `Email`: не пустой и содержит `@` — иначе ошибка «Некорректный email»;
- `Password`: длина ≥ 8 («Минимум 8 символов») и хотя бы одна цифра («Нужна цифра»);
- `Age`: ≥ 18 («Только для совершеннолетних»).

Поле без ошибок в словаре быть не должно.
@code
~~~csharp
using System;
using System.Collections.Generic;
using System.Linq;

public class RegisterRequest
{
    public string Email { get; set; }
    public string Password { get; set; }
    public int Age { get; set; }
}

public static class Solver
{
    public static Dictionary<string, List<string>> Validate(RegisterRequest r)
    {
        // TODO
        return new Dictionary<string, List<string>>();
    }
}
~~~
@tests
~~~csharp
class T
{
    public static void Run()
    {
        var ok = Solver.Validate(new RegisterRequest { Email = "a@b.ru", Password = "secret123", Age = 20 });
        Assert.Equal(0, ok.Count, "корректный запрос");

        var bad = Solver.Validate(new RegisterRequest { Email = "", Password = "abc", Age = 15 });
        Assert.Equal(3, bad.Count, "три поля с ошибками");
        Assert.Equal(new List<string> { "Некорректный email" }, bad["Email"], "email");
        Assert.Equal(new List<string> { "Минимум 8 символов", "Нужна цифра" }, bad["Password"], "пароль");
        Assert.Equal(new List<string> { "Только для совершеннолетних" }, bad["Age"], "возраст");

        var nullEmail = Solver.Validate(new RegisterRequest { Email = null, Password = "longpassword1", Age = 30 });
        Assert.True(nullEmail.ContainsKey("Email"), "null email");
        Assert.Equal(1, nullEmail.Count, "только email");
    }
}
~~~
@hint
Заведи вспомогательный `Add(dict, field, message)`, который создаёт список при первой ошибке. Email: `string.IsNullOrEmpty(r.Email) || !r.Email.Contains("@")`. Цифру ищи через `r.Password.Any(char.IsDigit)` (учти `null`).
@solution
~~~csharp
using System;
using System.Collections.Generic;
using System.Linq;

public class RegisterRequest
{
    public string Email { get; set; }
    public string Password { get; set; }
    public int Age { get; set; }
}

public static class Solver
{
    private static void Add(Dictionary<string, List<string>> d, string field, string msg)
    {
        if (!d.TryGetValue(field, out var list))
        {
            list = new List<string>();
            d[field] = list;
        }
        list.Add(msg);
    }

    public static Dictionary<string, List<string>> Validate(RegisterRequest r)
    {
        var errors = new Dictionary<string, List<string>>();
        if (string.IsNullOrEmpty(r.Email) || !r.Email.Contains("@"))
            Add(errors, "Email", "Некорректный email");

        var pwd = r.Password ?? "";
        if (pwd.Length < 8) Add(errors, "Password", "Минимум 8 символов");
        if (!pwd.Any(char.IsDigit)) Add(errors, "Password", "Нужна цифра");

        if (r.Age < 18) Add(errors, "Age", "Только для совершеннолетних");
        return errors;
    }
}
~~~
@why
Возвращаем **все** ошибки сразу, а не первую: пользователю не нужно исправлять форму по одной ошибке за раз. Формат «поле → ошибки» — это в точности `ValidationProblemDetails` в ASP.NET Core.
:::

:::cards Валидация
Границы доверия :: Клиентская валидация — для удобства; сервер проверяет всё сам.
400 vs 422 :: 400 — запрос не разобран; 422 — разобран, но смысл неверен.
Все ошибки сразу :: Возвращай набор ошибок по полям, а не первую.
:::


@@append id="p4-errors"
## Закрепление {#lab}

:::quiz Ошибки и логирование
? Что плохого в `catch (Exception) { }` в контроллере? #web
+ Ошибка проглочена: клиент получит 200, а разработчик — тишину в логах
- Ничего
- Это медленно
- Это запрещено компилятором
= Либо обработай осмысленно, либо дай глобальному обработчику превратить в ProblemDetails.

? Что нельзя писать в логи? #web
+ Пароли, токены, номера карт и другие персональные данные
- Идентификаторы запросов
- Названия методов
- Время выполнения
= Логи читают многие — и они живут долго.

? Чем структурное логирование лучше строкового? #web
+ Свойства (`{UserId}`) сохраняются как поля — по ним можно искать и фильтровать
- Оно короче
- Оно быстрее на диске
- Оно не требует настройки
= `logger.LogInformation("Order {OrderId} created", id)`, а не интерполяция строки.
:::

:::ide Исключение → HTTP-статус
@xp 60
@task
Реализуй `Solver.MapStatus(Exception e)` — как глобальный обработчик превращает исключение в статус ответа:
- `NotFoundException` → 404;
- `ValidationException` → 400;
- `ConflictException` → 409;
- `UnauthorizedAccessException` → 403;
- всё остальное → 500.

Порядок проверок важен: `NotFoundException` наследуется от `AppException`, а не от `Exception` напрямую.
@code
~~~csharp
using System;

public class AppException : Exception
{
    public AppException(string m) : base(m) { }
}
public class NotFoundException : AppException { public NotFoundException(string m) : base(m) { } }
public class ValidationException : AppException { public ValidationException(string m) : base(m) { } }
public class ConflictException : AppException { public ConflictException(string m) : base(m) { } }

public static class Solver
{
    public static int MapStatus(Exception e)
    {
        return 500;
    }
}
~~~
@tests
~~~csharp
class T
{
    public static void Run()
    {
        Assert.Equal(404, Solver.MapStatus(new NotFoundException("x")), "NotFound");
        Assert.Equal(400, Solver.MapStatus(new ValidationException("x")), "Validation");
        Assert.Equal(409, Solver.MapStatus(new ConflictException("x")), "Conflict");
        Assert.Equal(403, Solver.MapStatus(new UnauthorizedAccessException()), "Forbidden");
        Assert.Equal(500, Solver.MapStatus(new InvalidOperationException()), "неизвестное — 500");
        Assert.Equal(500, Solver.MapStatus(new AppException("base")), "базовое AppException — 500");
    }
}
~~~
@hint
Используй `switch` по типу: `e switch { NotFoundException => 404, ... , _ => 500 }`.
@solution
~~~csharp
using System;

public class AppException : Exception
{
    public AppException(string m) : base(m) { }
}
public class NotFoundException : AppException { public NotFoundException(string m) : base(m) { } }
public class ValidationException : AppException { public ValidationException(string m) : base(m) { } }
public class ConflictException : AppException { public ConflictException(string m) : base(m) { } }

public static class Solver
{
    public static int MapStatus(Exception e) => e switch
    {
        NotFoundException => 404,
        ValidationException => 400,
        ConflictException => 409,
        UnauthorizedAccessException => 403,
        _ => 500
    };
}
~~~
@why
В `IExceptionHandler` / middleware ошибок происходит именно такое отображение. Бизнес-код бросает осмысленные исключения, а HTTP-слой решает, как о них рассказать клиенту — и скрывает внутренности за единообразным `ProblemDetails`.
:::

:::cards Ошибки
Глобальный обработчик :: Единое место, где исключения превращаются в ProblemDetails.
5xx vs 4xx :: Ошибка клиента — 4xx; наш сбой — 5xx (без деталей наружу).
Структурные логи :: Именованные свойства вместо интерполяции строк.
:::


@@append id="p4-auth"
## Закрепление {#lab}

:::quiz Аутентификация и авторизация
? Что такое JWT? #web
+ Подписанный токен с утверждениями (claims); сервер проверяет подпись, не хранит сессию
- Зашифрованный пароль
- Cookie сессии
- Ключ API
= Полезная нагрузка JWT лишь закодирована (base64), не зашифрована — секретов в ней быть не должно.

? Как правильно хранить пароли? #web
+ В виде хэша с солью (bcrypt/Argon2/PBKDF2); не шифровать и не хранить открытым текстом
- В открытом виде
- Зашифрованными AES
- В виде MD5
= Хэширование необратимо; MD5/SHA-1 не подходят из-за скорости подбора.

? Чем аутентификация отличается от авторизации? #web
+ Аутентификация — кто ты; авторизация — что тебе разрешено
- Ничем
- Наоборот
- Авторизация — это логин
= Сначала `UseAuthentication`, затем `UseAuthorization`.

? Почему access-токен делают короткоживущим? #web
+ Украденный токен действует недолго; для продления используют refresh-токен
- Чтобы экономить память
- Из-за ограничений браузеров
- Потому что подпись устаревает
= JWT нельзя «отозвать» без дополнительной инфраструктуры, поэтому ограничивают срок жизни.
:::

:::cards Auth
JWT :: Подписанный (не зашифрованный!) токен с claims; без состояния на сервере.
Хэш пароля :: bcrypt / Argon2 / PBKDF2 с солью; MD5/SHA-1 — нельзя.
AuthN vs AuthZ :: Кто ты → что тебе можно.
Refresh-токен :: Долгоживущий токен для получения нового короткоживущего access-токена.
:::


@@append id="p4-docker"
## Закрепление {#lab}

:::quiz OpenAPI и Docker
? Зачем в Dockerfile используют multi-stage build? #web
+ Собирать в образе с SDK, а в итоговый образ класть только runtime и опубликованные файлы — он меньше и безопаснее
- Чтобы собирать быстрее без кэша
- Чтобы запускать несколько приложений
- Это требование Docker Hub
= Итоговый образ без SDK — меньше размер и поверхность атаки.

? Почему в контейнере БД не стоит хранить данные без volume? #web
+ При удалении контейнера данные пропадут — нужен том (volume)
- Это быстрее
- Контейнеры не умеют писать на диск
- Нельзя запускать БД в контейнере
= Контейнер эфемерен; состояние хранят снаружи.
:::

:::cards Docker
Образ vs контейнер :: Образ — шаблон; контейнер — запущенный экземпляр.
Multi-stage :: SDK для сборки, лёгкий runtime для запуска.
Volume :: Постоянное хранилище вне жизненного цикла контейнера.
:::


@@append id="p4-project"
## Код-ревью: чужой контроллер {#lab}

:::legacy UsersController из старого проекта
@context Аудит безопасности нашёл в контроллере несколько критичных проблем. Найди их до того, как их найдёт злоумышленник.
@code
~~~csharp
[ApiController]
[Route("api/[controller]")]
public class UsersController : ControllerBase
{
    [HttpGet("{id}")]
    public User Get(int id)
    {
        var db = new AppDbContext();
        return db.Users.FirstOrDefault(u => u.Id == id);
    }

    [HttpPost("login")]
    public IActionResult Login(string email, string password)
    {
        var user = new AppDbContext().Users.FirstOrDefault(u => u.Email == email && u.Password == password);
        if (user == null) return StatusCode(200, "fail");
        var token = Guid.NewGuid().ToString();
        Console.WriteLine("login " + email + " " + password);
        return Ok(token);
    }

    [HttpDelete("{id}")]
    public IActionResult Delete(int id)
    {
        try { var db = new AppDbContext(); db.Users.Remove(db.Users.Find(id)); db.SaveChanges(); }
        catch { }
        return Ok();
    }
}
~~~
@bug 6-10 | [sec] Возвращается сущность `User` целиком | В JSON уходят `Password` и внутренние поля; для несуществующего id — 200 с пустым телом вместо 404. Нужен DTO и `NotFound()`. Контекст создаётся вручную и не освобождается.
@bug 15 | [sec] Пароль хранится и сравнивается открытым текстом | Утечка базы = утечка всех паролей. Нужен хэш с солью и проверка через `PasswordHasher`; пароль не должен идти в query-параметрах.
@bug 16 | [bug] Неверный логин возвращает 200 | Клиент не отличит успех от неудачи по статусу; нужен `401 Unauthorized` с единообразным сообщением (без раскрытия «нет такого email»).
@bug 17-18 | [sec] «Токен» — случайный Guid, а пароль пишется в лог | Guid не подписан и ничего не доказывает, сервер его даже не запоминает; нужен JWT. Пароль в логах — прямая утечка.
@bug 25-27 | [bug] Пустой `catch` и `Ok()` всегда | `Find` вернёт `null` для несуществующего id → NRE проглатывается; клиент получает 200, хотя ничего не удалено. Плюс нет проверки прав: любой может удалить любого.
@fixed
~~~csharp
[ApiController]
[Route("api/[controller]")]
public class UsersController : ControllerBase
{
    private readonly IUserService _users;
    public UsersController(IUserService users) => _users = users;

    [HttpGet("{id}")]
    public async Task<ActionResult<UserDto>> Get(int id, CancellationToken ct)
        => await _users.GetAsync(id, ct) is { } dto ? dto : NotFound();

    [HttpPost("login")]
    public async Task<IActionResult> Login(LoginRequest req, CancellationToken ct)
    {
        var token = await _users.LoginAsync(req, ct);
        return token is null ? Unauthorized() : Ok(new { token });
    }

    [Authorize(Roles = "Admin")]
    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(int id, CancellationToken ct)
        => await _users.DeleteAsync(id, ct) ? NoContent() : NotFound();
}
~~~
:::


@@append id="p4"
## Итоговый тест фазы 4 {#lab}

:::quiz Итог фазы 4: ASP.NET Core
? Клиент вызывает `DELETE /orders/5` дважды. Первый вызов удалил заказ. Что корректно вернуть при втором? #web
+ 404 Not Found (или 204 — оба варианта идемпотентны по эффекту)
- 500
- 201
- 200 с новым заказом
= Состояние ресурса после обоих вызовов одинаково — заказа нет.

? Что будет с запросом, если middleware не вызывает `next`? #web
+ Цепочка прервётся, ответ сформирует этот middleware
- Запрос зависнет навсегда
- Запрос вернётся в начало
- Выбросится исключение
= Короткое замыкание — штатный приём.

? Какой lifetime у `DbContext` по умолчанию в `AddDbContext`? #web
+ Scoped
- Singleton
- Transient
- Нет lifetime
= Один контекст на запрос.

? Почему возврат сущности EF из API — плохая идея? #web
+ Утечка лишних полей, циклические ссылки при сериализации и жёсткая привязка контракта к схеме БД
- Это запрещено в ASP.NET
- Сериализуется медленнее всего
- Сущности не сериализуются
= Для API используем DTO.

? JWT содержит `{"role":"admin"}`. Может ли клиент изменить роль и отправить токен снова? #web
+ Нет: подпись перестанет сходиться, сервер отклонит токен
- Да, JWT не защищён
- Да, если знает публичный ключ
- Только в браузере
= Целостность держится на подписи; поэтому секретный ключ подписи — главный секрет.

? Где хранить строку подключения с паролем к боевой БД? #web
+ В переменных окружения/секретах окружения — не в репозитории
- В appsettings.json в git
- В коде
- В README
= В git секрет остаётся навсегда, даже если файл потом удалить.

? Что вернёт `[ApiController]`, если тело запроса не проходит валидацию модели? #web
+ Автоматически 400 с ValidationProblemDetails
- 500
- 200 с текстом ошибки
- 404
= Не надо писать `if (!ModelState.IsValid)` вручную.

? Когда нужен 201 Created, а не 200 OK? #web
+ Когда ресурс создан — вместе с заголовком `Location`
- Когда запрос успешен
- Когда ответ пустой
- Никогда
= `CreatedAtAction(nameof(Get), new { id }, dto)`.
:::

:::interview Что происходит при HTTP-запросе в ASP.NET Core
@q Опишите путь запроса от клиента до вашего метода контроллера и обратно.
@trap Целостная картина: Kestrel → middleware → routing → фильтры → модель → контроллер → результат → сериализация.
@answer
Запрос приходит в веб-сервер Kestrel, который собирает `HttpContext`. Он проходит цепочку middleware в порядке регистрации: обработка исключений, HTTPS, статические файлы, routing, аутентификация, авторизация. Routing выбирает эндпоинт. Далее — фильтры MVC и привязка модели (из route, query, body) с валидацией. Контроллер вызывает сервисы (зависимости получены из DI-контейнера на область запроса), возвращает `IActionResult`; результат сериализуется (System.Text.Json) в тело ответа. Ответ идёт обратно через те же middleware в обратном порядке, где можно добавить заголовки, залогировать длительность или перехватить ошибку.
@fail «Контроллер просто получает запрос» — пропущено всё, что делает платформа.
@follow Что изменится, если поменять местами UseAuthentication и UseAuthorization?
:::

:::interview Singleton, Scoped, Transient
@q Объясните разницу между lifetime'ами и приведите пример ошибки при неверном выборе.
@trap Знание captive dependency и потокобезопасности синглтонов.
@answer
Singleton — один экземпляр на приложение; Scoped — один на область (HTTP-запрос); Transient — новый на каждое получение. Singleton должен быть потокобезопасным, так как его делят все запросы. Типичная ошибка — singleton, получивший Scoped-зависимость (например `DbContext`): контекст «застревает», накапливает сущности, ломается при параллельных запросах. Отсюда правило: зависимость не должна жить дольше потребителя. Включаю `ValidateScopes`, чтобы ловить это в разработке.
@fail «Singleton быстрее, поэтому делаю всё singleton» — игнорируется состояние и потокобезопасность.
:::

:::cards Фаза 4: минимум
Pipeline :: Middleware по порядку регистрации; next прерывает/продолжает цепочку.
Lifetimes :: Singleton / Scoped / Transient; зависимость не живёт дольше потребителя.
DTO :: Контракт API отдельно от сущностей; защита от over-posting.
JWT :: Подписанный токен; не шифрует; живёт недолго.
Статусы :: 201 Created, 400 валидация, 401 не вошёл, 403 нельзя, 404 нет, 409 конфликт.
:::
