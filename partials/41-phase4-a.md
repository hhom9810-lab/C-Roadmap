@@page id="p4-http" phase="4" kind="topic" title="HTTP и REST: ресурсы, методы, коды ответа" nav="HTTP и REST" est="~1 неделя"
:::why
REST — это не «список правил для собеседования», а договорённость, которая позволяет клиентам (фронтенду, мобильному приложению, другим сервисам) работать с твоим API без чтения исходников. Каждое правило снимает конкретную проблему: кэширование, повторы запросов, понятные ошибки.
:::

## Зачем это нужно

Твой API будут вызывать люди и программы, которых ты никогда не увидишь: фронтенд-команда, мобильное приложение, интеграции, мониторинг, балансировщик, кэширующий прокси. Они не читают твой код — они читают **HTTP**. Если ты используешь методы, пути и коды ответа по общим договорённостям, всё это окружение работает «само»: прокси знает, что `GET` можно кэшировать, клиентская библиотека знает, что `PUT` можно безопасно повторить, а мониторинг считает ошибки по кодам `5xx`.

Если же ты игнорируешь договорённости, платишь за это каждый день:

- API, в котором всё идёт через `POST /api/doSomething`, не кэшируется, его трудно отлаживать и невозможно описать понятной схемой.
- Ответ `200 OK` с телом `{ "success": false }` не виден мониторингу: график ошибок остаётся зелёным, пока пользователи жалуются.
- Повторный `POST` при плохой сети создаёт двойной заказ и двойное списание денег.
- Эндпоинт, отдающий «все задачи» без пагинации, работает на тестовой базе и кладёт сервер на реальной.

Тема стабильно встречается на собеседованиях: «чем `PUT` отличается от `PATCH`?», «401 или 403?», «что значит идемпотентный?», «какой код вернуть при создании?». Здесь ты разберёшь не только ответы, но и увидишь живые HTTP-сообщения: мы запустим настоящий сервер на ASP.NET Core и посмотрим, что реально ходит по сети.

## Интуиция и аналогия

**Почтовая служба с типовыми бланками.** HTTP — это договорённость о форме письма. На конверте — адрес (путь) и пометка «что сделать» (метод): «вручить», «забрать», «заменить содержимое», «уничтожить». Внутри — заголовки (служебные пометки: формат, подпись) и тело (само содержимое). В ответе — **код** вроде «вручено», «адресата нет», «вам отказано». Любой почтальон (прокси, клиент, балансировщик) понимает пометки на конверте, даже не читая письмо. Поэтому важно писать их правильно.

**Ресурсы — существительные, методы — глаголы.** В хорошем API путь называет *вещь* (`/tasks/42`), а метод — *действие* над ней (`GET`, `PUT`, `DELETE`). Как в библиотеке: у книги есть место на полке (адрес), а с ней можно сделать несколько стандартных вещей — взять, заменить, вернуть. Нелепо было бы заводить на каждый вариант отдельный адрес вроде `/getBook42`, `/removeBook42`.

**Идемпотентность — лифт.** Если нажать кнопку «5-й этаж» ещё раз, ничего не изменится: лифт уже едет на пятый. Это идемпотентно. А кнопка «заказать ещё один лифт» при повторном нажатии вызывает второй. Сеть ненадёжна и запросы повторяются; важно знать, какие кнопки безопасно нажимать дважды.

## Основная теория по шагам

### Шаг 1. Анатомия запроса и ответа

HTTP — текстовый протокол «запрос → ответ» поверх TCP. Запрос состоит из стартовой строки (метод, путь, версия), заголовков, пустой строки и необязательного тела:

~~~text Запрос
POST /api/projects/7/tasks HTTP/1.1
Host: localhost:5000
Content-Type: application/json
Authorization: Bearer eyJhbGciOi...

{ "title": "Сверстать форму входа", "dueDate": "2026-11-01" }
~~~

~~~text Ответ
HTTP/1.1 201 Created
Location: /api/projects/7/tasks/42
Content-Type: application/json; charset=utf-8

{ "id": 42, "title": "Сверстать форму входа", "status": "Todo", "dueDate": "2026-11-01" }
~~~

Метод + путь говорят **что сделать и с каким ресурсом**, заголовки — метаданные (формат, авторизация), тело — данные, статус-код — **результат одним числом**.

Всё это не абстракция: запустим настоящий сервер на ASP.NET Core (Kestrel), отправим ему такой же запрос «вручную» по TCP-сокету и напечатаем сырой ответ. Служебные заголовки `Date` и `Server` отбросим, чтобы вывод был стабильным.

~~~csharp
using System.Net.Sockets;
using System.Text;

var builder = WebApplication.CreateBuilder();
builder.WebHost.UseUrls("http://127.0.0.1:0");          // порт выберет система
builder.Logging.ClearProviders();
var app = builder.Build();

app.MapPost("/api/projects/{projectId:int}/tasks", (int projectId, NewTask body) =>
    Results.Created($"/api/projects/{projectId}/tasks/42",
        new { id = 42, title = body.Title, status = "Todo", dueDate = body.DueDate }));

await app.StartAsync();
var port = new Uri(app.Urls.First()).Port;

var json = "{ \"title\": \"Сверстать форму входа\", \"dueDate\": \"2026-11-01\" }";
var request = $"POST /api/projects/7/tasks HTTP/1.1\r\nHost: localhost:{port}\r\n" +
              $"Content-Type: application/json\r\nContent-Length: {Encoding.UTF8.GetByteCount(json)}\r\n" +
              $"Connection: close\r\n\r\n{json}";

using var tcp = new TcpClient();
await tcp.ConnectAsync("127.0.0.1", port);
var stream = tcp.GetStream();
await stream.WriteAsync(Encoding.UTF8.GetBytes(request));
using var reader = new StreamReader(stream, Encoding.UTF8);
var raw = await reader.ReadToEndAsync();

foreach (var line in raw.Split("\r\n"))
    if (!line.StartsWith("Date:") && !line.StartsWith("Server:")) Console.WriteLine(line);

await app.StopAsync();

record NewTask(string Title, DateOnly DueDate);
~~~
~~~console
HTTP/1.1 201 Created
Connection: close
Content-Type: application/json; charset=utf-8
Location: /api/projects/7/tasks/42
Transfer-Encoding: chunked

63
{"id":42,"title":"Сверстать форму входа","status":"Todo","dueDate":"2026-11-01"}
0
~~~

Первая строка — статус (`201 Created`), дальше заголовки, пустая строка и тело. Заголовок `Location` сообщил клиенту адрес новой задачи — клиенту не нужно строить его самому. Заголовок `Transfer-Encoding: chunked` значит, что тело отправлено кусками: число `63` — длина первого куска в шестнадцатеричной записи (99 байт), а `0` в конце — признак конца тела. `HttpClient` и браузер собирают куски сами.

### Шаг 2. Ресурсы — существительные, методы — глаголы

| Действие | Метод и путь | Успех |
|---|---|---|
| Список задач проекта | `GET /api/projects/7/tasks?status=todo&page=2` | `200 OK` |
| Одна задача | `GET /api/tasks/42` | `200 OK` |
| Создать задачу | `POST /api/projects/7/tasks` | `201 Created` + `Location` |
| Заменить задачу целиком | `PUT /api/tasks/42` | `200 OK` или `204 No Content` |
| Изменить часть полей | `PATCH /api/tasks/42` | `200 OK` / `204` |
| Удалить | `DELETE /api/tasks/42` | `204 No Content` |
| Бизнес-действие | `POST /api/tasks/42/complete` | `200 OK` |

- ❌ `POST /api/getTasks`, `POST /api/deleteTask?id=42` — глаголы в пути, всё через POST.
- ✅ Путь называет ресурс, метод — действие.
- Действия, которые не ложатся на CRUD («завершить задачу», «назначить исполнителя»), оформляют как подресурс-действие через `POST`. Это нормально и честнее, чем притворяться, что это `PATCH` статуса.
- Пути во множественном числе (`/tasks`), без глаголов, в нижнем регистре через дефис; вложенность — только когда ресурс принадлежит родителю (`/projects/7/tasks`), и не глубже двух-трёх уровней.

### Шаг 3. Пробуем методы на живом API

Напишем минимальный in-memory API задач и пройдём по методам и кодам. Вызовы делает обычный `HttpClient` к настоящему серверу:

~~~csharp
using System.Net.Http.Json;
using System.Text;

var builder = WebApplication.CreateBuilder();
builder.WebHost.UseUrls("http://127.0.0.1:0");
builder.Logging.ClearProviders();
var app = builder.Build();

var tasks = new Dictionary<int, TaskItem>();
var nextId = 1;

var api = app.MapGroup("/api/tasks");
api.MapPost("", (NewTask n) =>
{
    var t = new TaskItem(nextId++, n.Title, "Todo");
    tasks[t.Id] = t;
    return Results.Created($"/api/tasks/{t.Id}", t);
});
api.MapGet("/{id:int}", (int id) => tasks.TryGetValue(id, out var t) ? Results.Ok(t) : Results.NotFound());
api.MapPut("/{id:int}", (int id, NewTask n) =>
{
    if (!tasks.ContainsKey(id)) return Results.NotFound();
    tasks[id] = tasks[id] with { Title = n.Title };
    return Results.NoContent();
});
api.MapDelete("/{id:int}", (int id) => tasks.Remove(id) ? Results.NoContent() : Results.NotFound());
api.MapPost("/{id:int}/complete", (int id) =>
{
    if (!tasks.TryGetValue(id, out var t)) return Results.NotFound();
    if (t.Status == "Done") return Results.Conflict(new { error = "задача уже закрыта" });
    tasks[id] = t with { Status = "Done" };
    return Results.Ok(tasks[id]);
});

await app.StartAsync();
using var http = new HttpClient { BaseAddress = new Uri(app.Urls.First()) };

async Task Show(string label, Task<HttpResponseMessage> call)
{
    var r = await call;
    var loc = r.Headers.Location is { } l ? $"   Location: {l}" : "";
    Console.WriteLine($"{label,-36} → {(int)r.StatusCode} {r.ReasonPhrase}{loc}");
}

await Show("POST   /api/tasks", http.PostAsJsonAsync("/api/tasks", new { title = "Форма входа" }));
await Show("GET    /api/tasks/1", http.GetAsync("/api/tasks/1"));
await Show("GET    /api/tasks/99", http.GetAsync("/api/tasks/99"));
await Show("PUT    /api/tasks/1", http.PutAsJsonAsync("/api/tasks/1", new { title = "Новое название" }));
await Show("PUT    /api/tasks/1 (повтор)", http.PutAsJsonAsync("/api/tasks/1", new { title = "Новое название" }));
await Show("POST   /api/tasks/1/complete", http.PostAsync("/api/tasks/1/complete", null));
await Show("POST   /api/tasks/1/complete (повтор)", http.PostAsync("/api/tasks/1/complete", null));
await Show("GET    /api/tasks/1/complete", http.GetAsync("/api/tasks/1/complete"));
await Show("POST   text/plain вместо JSON", http.PostAsync("/api/tasks", new StringContent("{}", Encoding.UTF8, "text/plain")));
await Show("POST   битый JSON", http.PostAsync("/api/tasks", new StringContent("{ title", Encoding.UTF8, "application/json")));
await Show("DELETE /api/tasks/1", http.DeleteAsync("/api/tasks/1"));
await Show("DELETE /api/tasks/1 (повтор)", http.DeleteAsync("/api/tasks/1"));

await Show("POST   /api/tasks (ещё раз)", http.PostAsJsonAsync("/api/tasks", new { title = "Форма входа" }));
await Show("POST   /api/tasks (и ещё раз)", http.PostAsJsonAsync("/api/tasks", new { title = "Форма входа" }));
Console.WriteLine($"задач в «базе»: {tasks.Count}");
await app.StopAsync();

record NewTask(string Title);
record TaskItem(int Id, string Title, string Status);
~~~
~~~console
POST   /api/tasks                    → 201 Created   Location: /api/tasks/1
GET    /api/tasks/1                  → 200 OK
GET    /api/tasks/99                 → 404 Not Found
PUT    /api/tasks/1                  → 204 No Content
PUT    /api/tasks/1 (повтор)         → 204 No Content
POST   /api/tasks/1/complete         → 200 OK
POST   /api/tasks/1/complete (повтор) → 409 Conflict
GET    /api/tasks/1/complete         → 405 Method Not Allowed
POST   text/plain вместо JSON        → 415 Unsupported Media Type
POST   битый JSON                    → 400 Bad Request
DELETE /api/tasks/1                  → 204 No Content
DELETE /api/tasks/1 (повтор)         → 404 Not Found
POST   /api/tasks (ещё раз)          → 201 Created   Location: /api/tasks/2
POST   /api/tasks (и ещё раз)        → 201 Created   Location: /api/tasks/3
задач в «базе»: 2
~~~

Что видно на этом выводе:

- Создание вернуло `201 Created` и адрес нового ресурса в `Location`; `PUT` и `DELETE` без тела — `204 No Content`.
- Неизвестный `id` — `404`, неверный метод для существующего пути — `405 Method Not Allowed`, неверный формат тела — `415 Unsupported Media Type`, битый JSON — `400 Bad Request`. Всё это ASP.NET Core делает сам.
- Повтор `PUT` дал тот же результат, повтор `DELETE` — `404` (ресурса уже нет, но состояние сервера то же), а повтор `POST` создал **ещё одну** задачу. Это и есть идемпотентность на практике.
- Повторное закрытие задачи — `409 Conflict`: состояние ресурса не позволяет операцию.

### Шаг 4. Безопасность и идемпотентность

| Метод | Безопасный (не меняет данные) | Идемпотентный (повтор = тот же результат) |
|---|---|---|
| `GET` | да | да |
| `PUT` | нет | **да** |
| `DELETE` | нет | **да** |
| `POST` | нет | **нет** |
| `PATCH` | нет | не гарантируется |

**Зачем это знать:** сеть ненадёжна, клиенты и прокси повторяют запросы. Повтор `PUT /tasks/42` безвреден — задача станет такой же. Повтор `POST /orders` создаст **второй заказ**. Поэтому для важных `POST` придумывают защиту от дублей — ключ идемпотентности в заголовке (так делают платёжные API; это общепринятая конвенция, а не часть базового протокола). Клиент генерирует уникальный ключ и повторяет запрос с тем же значением, а сервер, увидев знакомый ключ, возвращает прежний результат вместо создания нового.

~~~csharp
using System.Net.Http.Json;

var builder = WebApplication.CreateBuilder();
builder.WebHost.UseUrls("http://127.0.0.1:0");
builder.Logging.ClearProviders();
var app = builder.Build();

var seen = new Dictionary<string, int>();   // ключ идемпотентности → id созданного заказа
var created = 0;

app.MapPost("/api/orders", (HttpRequest req) =>
{
    var key = req.Headers["Idempotency-Key"].ToString();
    if (key != "" && seen.TryGetValue(key, out var existing))
        return Results.Ok(new { id = existing, repeated = true });       // повтор: отдаём прежний результат

    var id = ++created;
    if (key != "") seen[key] = id;
    return Results.Created($"/api/orders/{id}", new { id, repeated = false });
});

await app.StartAsync();
using var http = new HttpClient { BaseAddress = new Uri(app.Urls.First()) };

for (var i = 0; i < 2; i++) await http.PostAsync("/api/orders", null);
Console.WriteLine($"без ключа, 2 запроса → заказов создано: {created}");

created = 0;
for (var i = 0; i < 2; i++)
{
    using var msg = new HttpRequestMessage(HttpMethod.Post, "/api/orders");
    msg.Headers.Add("Idempotency-Key", "order-7f3a");
    var r = await http.SendAsync(msg);
    Console.WriteLine($"с ключом, запрос {i + 1} → {(int)r.StatusCode} {await r.Content.ReadAsStringAsync()}");
}
Console.WriteLine($"с ключом, 2 запроса → заказов создано: {created}");
await app.StopAsync();
~~~
~~~console
без ключа, 2 запроса → заказов создано: 2
с ключом, запрос 1 → 201 {"id":1,"repeated":false}
с ключом, запрос 2 → 200 {"id":1,"repeated":true}
с ключом, 2 запроса → заказов создано: 1
~~~

### Шаг 5. Коды ответа, которые нужно знать

| Код | Значит | Когда |
|---|---|---|
| `200 OK` | успех с телом | GET, PUT/PATCH с возвратом объекта |
| `201 Created` | ресурс создан | POST; заголовок `Location` указывает на новый ресурс |
| `204 No Content` | успех без тела | DELETE, PUT без возврата |
| `400 Bad Request` | запрос некорректен | ошибки валидации |
| `401 Unauthorized` | **не аутентифицирован** | нет токена или он невалиден |
| `403 Forbidden` | аутентифицирован, но **нет прав** | роль не та |
| `404 Not Found` | ресурса нет | неизвестный id |
| `409 Conflict` | конфликт состояния | дубликат email, задача уже закрыта |
| `422 Unprocessable Entity` | синтаксис верен, но нарушены правила | альтернатива 400 для бизнес-проверок (договорись в команде) |
| `429 Too Many Requests` | превышен лимит запросов | rate limiting |
| `500 Internal Server Error` | ошибка сервера | необработанное исключение — **баг** |

Классы по первой цифре: `2xx` — успех, `3xx` — перенаправление, `4xx` — ошибка клиента (запрос нужно изменить), `5xx` — ошибка сервера (запрос корректен, но сервер не справился). Клиентские библиотеки и мониторинг опираются именно на этот класс.

:::danger `200 OK` с `{ "success": false }`
Клиенту приходится разбирать тело, чтобы понять, что произошла ошибка; кэши, мониторинг и логи считают запрос успешным. Ошибка должна быть видна по коду статуса.
:::

Название `401 Unauthorized` исторически неудачное: на деле означает «не аутентифицирован». А «нет прав» — `403`. Запомни по смыслу: `401` — «представьтесь», `403` — «вас знаем, но нельзя».

### Шаг 6. Коллекции: фильтрация, сортировка, пагинация

~~~text
GET /api/tasks?status=inProgress&assigneeId=3&sort=-dueDate&page=2&pageSize=20
~~~

- Фильтры и сортировка — в query string.
- **Пагинация обязательна** для любых коллекций, которые растут. Ограничь `pageSize` сверху (например, 100), иначе один запрос выгрузит всю таблицу.
- Возвращай метаданные: общее количество, номер страницы.

~~~json
{
  "items": [ { "id": 42, "title": "Сверстать форму входа" } ],
  "page": 2,
  "pageSize": 20,
  "totalCount": 137
}
~~~

Проверим ограничение размера страницы на работающем эндпоинте:

~~~csharp
using System.Net.Http.Json;
using System.Text.Json;

var builder = WebApplication.CreateBuilder();
builder.WebHost.UseUrls("http://127.0.0.1:0");
builder.Logging.ClearProviders();
var app = builder.Build();

var all = Enumerable.Range(1, 137).ToList();

app.MapGet("/api/tasks", (int? page, int? pageSize) =>
{
    var size = Math.Clamp(pageSize ?? 20, 1, 100);       // верхняя граница обязательна
    var p = Math.Max(page ?? 1, 1);
    var items = all.Skip((p - 1) * size).Take(size).ToList();
    return new { items, page = p, pageSize = size, totalCount = all.Count };
});

await app.StartAsync();
using var http = new HttpClient { BaseAddress = new Uri(app.Urls.First()) };

foreach (var query in new[] { "?page=2&pageSize=20", "?page=7&pageSize=20", "?pageSize=100000", "?page=-5" })
{
    var json = await http.GetFromJsonAsync<JsonElement>("/api/tasks" + query);
    Console.WriteLine($"{query,-22} → в ответе {json.GetProperty("items").GetArrayLength(),3} шт., " +
                      $"page={json.GetProperty("page")}, pageSize={json.GetProperty("pageSize")}, всего={json.GetProperty("totalCount")}");
}
await app.StopAsync();
~~~
~~~console
?page=2&pageSize=20    → в ответе  20 шт., page=2, pageSize=20, всего=137
?page=7&pageSize=20    → в ответе  17 шт., page=7, pageSize=20, всего=137
?pageSize=100000       → в ответе 100 шт., page=1, pageSize=100, всего=137
?page=-5               → в ответе  20 шт., page=1, pageSize=20, всего=137
~~~

Запрос `pageSize=100000` не выгрузил всю таблицу, а отрицательный номер страницы привёлся к первой. Параметры от клиента нельзя доверчиво подставлять в `Skip`/`Take`.

Для очень больших или часто меняющихся таблиц `OFFSET` (в `Skip`) замедляется на больших страницах; тогда используют «курсорную» пагинацию: клиент передаёт `after=<последний id>`, а запрос выглядит как `WHERE id > @after ORDER BY id LIMIT 20`. Для учебного проекта хватит страниц.

## Как это работает под капотом

- **Текст поверх TCP.** HTTP/1.1 — текстовый протокол: именно такие строки мы отправили сокету в первом примере. Версии HTTP/2 и HTTP/3 передают те же понятия (метод, заголовки, тело, статус) в бинарном виде и мультиплексируют запросы по одному соединению, но для прикладного кода различий почти нет.
- **Kestrel и конвейер.** Сервер Kestrel читает байты, разбирает запрос и передаёт его в конвейер ASP.NET Core ([middleware](#p4-middleware)), где маршрутизация выбирает обработчик. Результат (`Results.Created`, `Results.NotFound`) превращается в статус, заголовки и тело — ровно то, что мы видели.
- **Привязка тела.** Для `NewTask n` фреймворк проверяет `Content-Type` (иначе `415`), читает тело, десериализует JSON (при ошибке разбора — `400`) и только потом вызывает твой код. Поэтому «лишних» проверок формата в обработчике писать не нужно.
- **Статус `405`.** Маршрутизация знает, какие методы разрешены для пути; при несовпадении метода возвращает `405` (и заголовок `Allow`) вместо `404`.
- **Stateless.** Сервер не хранит состояние сессии между запросами: всё, что нужно (токен, параметры), приходит в запросе. Это позволяет запускать несколько копий приложения за балансировщиком и перезапускать их без последствий.
- **Кэширование.** Безопасные идемпотентные `GET` можно кэшировать (заголовки `Cache-Control`, `ETag`); `POST` не кэшируют. Поэтому «читающий» эндпоинт, реализованный как `POST`, лишает тебя кэша.
- **Таймауты и повторы.** Клиент, не дождавшийся ответа, не знает, выполнился ли запрос. Идемпотентные методы повторяют автоматически (клиентские библиотеки и прокси), неидемпотентные — нет, если не добавлен ключ идемпотентности.
- **Разница `PUT` и `PATCH`.** `PUT` заменяет ресурс полностью (отсутствующие поля сбрасываются), `PATCH` меняет часть. Формат `PATCH`-тела в .NET чаще всего задают собственной DTO с необязательными полями (JSON Patch — отдельный формат).

## Типичные ошибки и ловушки

- **Глаголы в путях и всё через `POST`.** Теряешь кэш, читаемость и стандартные инструменты.
- **`200 OK` с признаком ошибки в теле.** Мониторинг и клиенты слепы.
- **`GET`, который меняет данные.** Поисковый робот или предзагрузка браузера выполнят «удаление».
- **Путаница `401` и `403`.** Первая — «кто ты?», вторая — «тебе нельзя».
- **Возврат `500` на ошибки клиента.** Необработанная проверка (`id` не найден → `NullReferenceException`) превращается в `500` вместо `404`.
- **Нет пагинации и верхнего предела `pageSize`.** Один запрос выгружает таблицу.
- **`POST` для создания без `201` и `Location`.** Клиент вынужден искать идентификатор в теле.
- **Нет защиты важных `POST` от повторов.** Двойные заказы и платежи при ретраях.
- **Разные форматы ошибок в разных эндпоинтах.** Клиенту приходится писать десять разборщиков; выбери один формат ([ProblemDetails](#p4-errors)) на всё API.
- **Версионирование «потом».** Меняешь формат ответа — ломаешь клиентов; продумай заранее (префикс `/api/v1` либо заголовок).
- **Секреты в query string.** Адреса попадают в логи и историю; токены передают в заголовке `Authorization`.

## Вопросы с собеседований

:::spoiler Разница 401 и 403
401 — сервер не знает, кто ты (нет или невалидный токен). 403 — сервер знает, кто ты, но тебе это нельзя.
:::

:::spoiler Почему PUT идемпотентен, а POST — нет?
PUT задаёт полное состояние ресурса по известному адресу: повтор приводит к тому же состоянию. POST создаёт новый ресурс или запускает действие: каждый повтор создаёт ещё один.
:::

:::spoiler Как оформить «закрыть задачу» в REST?
Как действие над ресурсом: `POST /api/tasks/42/complete`. Это явно, позволяет проверить бизнес-правила (нельзя закрыть уже закрытую → 409) и не путает с произвольным редактированием полей.
:::

:::spoiler Чем PUT отличается от PATCH?
`PUT` заменяет ресурс целиком (идемпотентен), `PATCH` изменяет часть полей (идемпотентность не гарантируется, зависит от операции).
:::

:::spoiler Что вернуть при создании ресурса? (ловушка: «200 и объект»)
`201 Created` с заголовком `Location` на новый ресурс и, как правило, самим объектом в теле. `200` формально допустим, но не сообщает клиенту адрес.
:::

:::spoiler Чем безопасный метод отличается от идемпотентного?
Безопасный не меняет состояние сервера (`GET`). Идемпотентный — повтор даёт то же состояние (`PUT`, `DELETE`, `GET`), хотя состояние менять может. Все безопасные идемпотентны, обратное неверно.
:::

:::spoiler Что делать, чтобы повтор `POST` не создал дубль?
Ключ идемпотентности: клиент присылает уникальное значение в заголовке, сервер сохраняет результат по ключу и при повторе возвращает его же. Либо естественный уникальный ключ в данных (уникальный индекс и `409`).
:::

:::spoiler Какой код вернуть, если задача не найдена? А если email уже занят?
Не найдена — `404`. Email занят — `409 Conflict` (или `422`, если так договорено в команде).
:::

## Что запомнить

- Путь называет ресурс (существительное), метод — действие; не-CRUD действия — `POST /…/complete`.
- `GET` безопасен и идемпотентен; `PUT` и `DELETE` идемпотентны; `POST` — нет; важные `POST` защищай ключом идемпотентности.
- Код ответа — главный сигнал результата: `2xx` успех, `4xx` ошибка клиента, `5xx` ошибка сервера. Никогда `200` с `success: false`.
- `201` + `Location` при создании, `204` без тела, `401` — не аутентифицирован, `403` — нет прав, `404` — нет ресурса, `409` — конфликт состояния.
- Любая растущая коллекция — с пагинацией и верхним пределом `pageSize`.
- Единый формат ошибок на всё API; секреты — в заголовках, не в адресе.
- Хороший API проверяют живыми запросами, а не только чтением кода.

## Практика

- [ ] Спроектировал на бумаге все эндпоинты своего проекта: метод, путь, тело, коды успеха и ошибок
- [ ] Для каждого `POST` записал, что будет при повторном запросе
- [ ] Выбрал формат пагинации и ошибок для всего API и записал в README

@@page id="p4-hosting" phase="4" kind="topic" title="Хост, Program.cs, конфигурация и секреты" nav="Хост и конфигурация" est="~1 неделя"
:::why
`Program.cs` — точка, где собирается всё приложение: сервисы, конфигурация, конвейер запросов. Понимая его, ты читаешь любой чужой проект за пять минут. Конфигурация и секреты — первое, что проверяют на код-ревью: пароль в git — это инцидент.
:::

## Зачем это нужно

Любое серверное приложение должно ответить на три вопроса ещё до первого запроса: **из чего я собрано** (какие сервисы зарегистрированы), **как я настроено** (строка подключения, лимиты, ключи) и **что делаю с входящим запросом** (какой конвейер). Всё это в ASP.NET Core записано в одном месте — `Program.cs`. Научишься читать его — и любой чужой проект перестанет быть чёрным ящиком.

Настройки — отдельная боль. Один и тот же код должен работать:

- у тебя на ноутбуке (локальная база, подробные логи);
- у коллеги (другой порт, другой пароль);
- в тестовом окружении и в Docker (адрес базы из переменной окружения);
- в продакшене (секреты из защищённого хранилища, минимум логов).

Если значения вшиты в код, на каждое окружение придётся пересобирать приложение; если пароль лежит в `appsettings.json` в git — он считается утёкшим. Конфигурация ASP.NET Core решает обе задачи: настройки собираются из нескольких слоёв, а код читает их типизированно.

Эта тема — частый предмет собеседований и код-ревью: «что делает `WebApplication.CreateBuilder`?», «в каком порядке читается конфигурация?», «чем `IOptions` отличается от `IOptionsSnapshot`?», «где хранить секреты?», «что такое окружение?». Ниже мы запустим всё это по-настоящему: создадим файлы настроек, выставим переменные окружения и посмотрим, какое значение победит.

## Интуиция и аналогия

**Сборка конструктора: сначала детали, потом инструкция.** `WebApplication.CreateBuilder` — это коробка с деталями: ты кладёшь туда сервисы и настройки (`builder.Services`, `builder.Configuration`). `builder.Build()` — момент, когда коробку запечатывают и получают готовую конструкцию (`app`). После этого детали уже не добавишь, зато можно описать **маршрут** — через какие станции проходит каждый посетитель (middleware) и к каким окошкам он может подойти (эндпоинты).

**Конфигурация — слоёный пирог с прозрачными слоями.** Нижний слой — `appsettings.json` — общие значения. Выше — файл для окружения: «в разработке — подробнее». Выше — переменные окружения: «здесь, на этом сервере — вот так». Сверху — аргументы командной строки: «а сейчас вообще запускаем с такой настройкой». Когда ты смотришь сверху, видишь значение из самого верхнего слоя, где оно задано; нижние просвечивают там, где верхние пусты.

**Секреты — сейф, а не записка на холодильнике.** `appsettings.json` лежит в git — это записка на холодильнике, которую видят все. Секреты (пароли, ключи) должны лежать там, куда репозиторий не дотягивается: на твоём ноутбуке — в user secrets, на сервере — в переменных окружения или хранилище секретов.

## Основная теория по шагам

### Шаг 1. Создание проекта

~~~bash
dotnet new webapi -n TaskBoard.Api --use-controllers   # с контроллерами
# или без флага — шаблон с minimal API
cd TaskBoard.Api
dotnet run
~~~

Шаблон создаёт `Program.cs`, `appsettings.json`, `appsettings.Development.json` и `Properties/launchSettings.json` (профили запуска с адресами и окружением).

### Шаг 2. Program.cs: два этапа

~~~csharp Program.cs @nocheck
var builder = WebApplication.CreateBuilder(args);   // 1. Построитель: конфигурация, логирование, DI

// --- регистрация сервисов (DI-контейнер) ---
builder.Services.AddControllers();
builder.Services.AddProblemDetails();
builder.Services.Configure<PaginationOptions>(builder.Configuration.GetSection("Pagination"));

var app = builder.Build();                          // 2. Приложение: контейнер собран, дальше — конвейер

// --- конвейер middleware: порядок важен ---
if (app.Environment.IsDevelopment())
{
    // инструменты разработки: OpenAPI-документ, подробные ошибки
}
app.UseExceptionHandler();
app.UseHttpsRedirection();
app.MapControllers();

app.Run();                                          // запустить веб-сервер Kestrel и ждать запросов

public sealed class PaginationOptions
{
    public int DefaultPageSize { get; set; } = 20;
    public int MaxPageSize { get; set; } = 100;
}
~~~

- **До `Build()`** — регистрируем сервисы и настройки.
- **После `Build()`** — описываем, через какие этапы проходит каждый HTTP-запрос ([middleware](#p4-middleware)) и какие эндпоинты существуют.

Что именно делает `CreateBuilder(args)`: создаёт хост с разумными умолчаниями — подключает Kestrel, настраивает источники конфигурации (файлы, переменные окружения, аргументы), включает логирование в консоль и отладчик, создаёт DI-контейнер. Поэтому тебе не нужно писать ничего из этого вручную.

Разделение этапов можно проверить: после `Build()` реестр сервисов закрыт, и регистрация нового сервиса — ошибка.

~~~csharp
var builder = WebApplication.CreateBuilder();
builder.Logging.ClearProviders();
builder.Services.AddSingleton<object>(new object());      // до Build() — можно
var app = builder.Build();

try { builder.Services.AddSingleton<string>("поздно"); }   // после Build() — нельзя
catch (InvalidOperationException ex) { Console.WriteLine(ex.Message); }
~~~
~~~console
The service collection cannot be modified because it is read-only.
~~~

### Шаг 3. Конфигурация: слои, а не один файл

Значения собираются из нескольких источников; каждый следующий **переопределяет** предыдущий:

1. `appsettings.json`
2. `appsettings.{Environment}.json` (например, `appsettings.Development.json`)
3. User Secrets (только в Development)
4. Переменные окружения
5. Аргументы командной строки

~~~json appsettings.json
{
  "ConnectionStrings": {
    "Default": "Host=localhost;Database=taskboard;Username=postgres"
  },
  "Pagination": { "DefaultPageSize": 20, "MaxPageSize": 100 },
  "Jwt": { "Issuer": "taskboard", "Audience": "taskboard-clients" },
  "Logging": { "LogLevel": { "Default": "Information", "Microsoft.AspNetCore": "Warning" } }
}
~~~

~~~bash Переопределение через переменную окружения (двойное подчёркивание = вложенность)
export Pagination__MaxPageSize=50
export ConnectionStrings__Default="Host=db;Database=taskboard;Username=app;Password=..."
~~~

Это то, как приложение в Docker и на сервере получает свои настройки без изменения файлов: образ собирается один раз и запускается в любом окружении, а различия задаются снаружи. Такой подход — один из принципов «приложения двенадцати факторов» (конфигурация хранится в окружении). Двойное подчёркивание в имени переменной заменяет двоеточие в ключе (`Pagination:MaxPageSize`), потому что двоеточие в именах переменных окружения допускается не везде.

Проверим порядок на настоящем построителе: создадим два файла настроек во временной папке, а затем будем добавлять слои — окружение, переменную, аргумент.

~~~csharp
var dir = Directory.CreateTempSubdirectory().FullName;
File.WriteAllText(Path.Combine(dir, "appsettings.json"),
    """{ "Pagination": { "DefaultPageSize": 20, "MaxPageSize": 100 } }""");
File.WriteAllText(Path.Combine(dir, "appsettings.Development.json"),
    """{ "Pagination": { "MaxPageSize": 50 } }""");

string Read(string[] args, string env)
{
    var b = WebApplication.CreateBuilder(new WebApplicationOptions { Args = args, ContentRootPath = dir, EnvironmentName = env });
    var c = b.Configuration;
    return $"Default = {c["Pagination:DefaultPageSize"]}, Max = {c["Pagination:MaxPageSize"]}";
}

Console.WriteLine("Production:                      " + Read([], "Production"));
Console.WriteLine("Development (файл окружения):    " + Read([], "Development"));

Environment.SetEnvironmentVariable("Pagination__MaxPageSize", "30");
Console.WriteLine("+ переменная окружения:          " + Read([], "Development"));
Console.WriteLine("+ аргумент командной строки:     " + Read(["--Pagination:MaxPageSize=10"], "Development"));

Environment.SetEnvironmentVariable("Pagination__MaxPageSize", null);
Directory.Delete(dir, recursive: true);
~~~
~~~console
Production:                      Default = 20, Max = 100
Development (файл окружения):    Default = 20, Max = 50
+ переменная окружения:          Default = 20, Max = 30
+ аргумент командной строки:     Default = 20, Max = 10
~~~

Значение `DefaultPageSize` во всех строках одно и то же (его никто не переопределил), а `MaxPageSize` на каждом слое побеждает вышележащий: 100 → 50 → 30 → 10. Файл `appsettings.Development.json` вообще не участвует в Production.

### Шаг 4. Options pattern — типизированные настройки

~~~csharp @nocheck
public sealed class TaskQueryService
{
    private readonly PaginationOptions _paging;

    public TaskQueryService(IOptions<PaginationOptions> options) => _paging = options.Value;

    public int NormalizePageSize(int? requested) =>
        Math.Clamp(requested ?? _paging.DefaultPageSize, 1, _paging.MaxPageSize);
}
~~~

Вместо строк `configuration["Pagination:MaxPageSize"]`, разбросанных по коду, — класс с типами, значениями по умолчанию и одним местом привязки. Три интерфейса различаются тем, **когда** они читают значения:

| Интерфейс | Время жизни | Видит изменения файла? |
|---|---|---|
| `IOptions<T>` | singleton | нет, значение читается один раз |
| `IOptionsSnapshot<T>` | scoped (на запрос) | да — в следующем запросе |
| `IOptionsMonitor<T>` | singleton | да — сразу, плюс событие `OnChange` |

Убедимся на примере. Файловый наблюдатель заменим крошечным провайдером, который умеет «сообщить об изменении» — ровно это делает настоящий провайдер JSON-файла, когда видит правку на диске:

~~~csharp
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;

var source = new MutableProvider(("Pagination:MaxPageSize", "100"));
var config = new ConfigurationBuilder().Add(new MutableSource(source)).Build();

var services = new ServiceCollection();
services.Configure<PaginationOptions>(config.GetSection("Pagination"));
using var provider = services.BuildServiceProvider();

var once = provider.GetRequiredService<IOptions<PaginationOptions>>();
var monitor = provider.GetRequiredService<IOptionsMonitor<PaginationOptions>>();
monitor.OnChange(o => Console.WriteLine($"   [OnChange] теперь {o.MaxPageSize}"));

Console.WriteLine($"сначала:  IOptions = {once.Value.MaxPageSize}, IOptionsMonitor = {monitor.CurrentValue.MaxPageSize}");
using (var scope = provider.CreateScope())
    Console.WriteLine($"          запрос 1: IOptionsSnapshot = {scope.ServiceProvider.GetRequiredService<IOptionsSnapshot<PaginationOptions>>().Value.MaxPageSize}");

source.Update("Pagination:MaxPageSize", "50");          // «файл изменился»
await Task.Delay(200);

Console.WriteLine($"потом:    IOptions = {once.Value.MaxPageSize}, IOptionsMonitor = {monitor.CurrentValue.MaxPageSize}");
using (var scope = provider.CreateScope())
    Console.WriteLine($"          запрос 2: IOptionsSnapshot = {scope.ServiceProvider.GetRequiredService<IOptionsSnapshot<PaginationOptions>>().Value.MaxPageSize}");

public sealed class PaginationOptions
{
    public int DefaultPageSize { get; set; } = 20;
    public int MaxPageSize { get; set; } = 100;
}

public sealed class MutableProvider : ConfigurationProvider
{
    public MutableProvider(params (string Key, string Value)[] initial) { foreach (var (k, v) in initial) Data[k] = v; }
    public void Update(string key, string value) { Data[key] = value; OnReload(); }      // OnReload() будит подписчиков
}

public sealed class MutableSource(MutableProvider provider) : IConfigurationSource
{
    public IConfigurationProvider Build(IConfigurationBuilder builder) => provider;
}
~~~
~~~console
сначала:  IOptions = 100, IOptionsMonitor = 100
          запрос 1: IOptionsSnapshot = 100
   [OnChange] теперь 50
потом:    IOptions = 100, IOptionsMonitor = 50
          запрос 2: IOptionsSnapshot = 50
~~~

`IOptions` застыл на старом значении, `IOptionsMonitor` обновился сразу (и сообщил об этом), а `IOptionsSnapshot` отдал новое значение уже следующему «запросу». Правило выбора: по умолчанию `IOptions<T>`; если настройка должна меняться без перезапуска — `IOptionsSnapshot` (в обработчиках запросов) или `IOptionsMonitor` (в singleton-сервисах).

### Шаг 5. Проверка настроек при старте

Опечатка в настройке не должна всплывать на сотом запросе. Options умеют проверять себя — аннотациями и **при старте приложения**:

~~~csharp
using System.ComponentModel.DataAnnotations;
using Microsoft.Extensions.Options;

var builder = WebApplication.CreateBuilder();
builder.WebHost.UseUrls("http://127.0.0.1:0");
builder.Logging.ClearProviders();
builder.Configuration["Pagination:MaxPageSize"] = "0";             // некорректно

builder.Services.AddOptions<PaginationOptions>()
    .BindConfiguration("Pagination")
    .ValidateDataAnnotations()
    .ValidateOnStart();                                            // без этого ошибка всплывёт при первом чтении

var app = builder.Build();
try { await app.StartAsync(); Console.WriteLine("запустились"); }
catch (OptionsValidationException ex)
{
    foreach (var failure in ex.Failures) Console.WriteLine("ошибка настроек: " + failure);
}

public sealed class PaginationOptions
{
    [Range(1, 1000)] public int DefaultPageSize { get; set; } = 20;
    [Range(1, 1000)] public int MaxPageSize { get; set; } = 100;
}
~~~
~~~console
ошибка настроек: DataAnnotation validation failed for 'PaginationOptions' members: 'MaxPageSize' with the error: 'The field MaxPageSize must be between 1 and 1000.'.
~~~

Приложение с неверной настройкой **не запускается** и сразу говорит, что не так. Это в тысячу раз лучше, чем работать с `MaxPageSize = 0` и выдавать пустые страницы.

### Шаг 6. Секреты

~~~bash User Secrets — для разработки
dotnet user-secrets init
dotnet user-secrets set "ConnectionStrings:Default" "Host=localhost;Database=taskboard;Username=postgres;Password=dev"
dotnet user-secrets set "Jwt:Key" "длинный-случайный-ключ-не-короче-32-байт-0123456789"
~~~

User Secrets хранятся **вне папки проекта** в профиле пользователя и не попадают в git. На сервере и в Docker секреты передаются через переменные окружения или хранилище секретов (облачные Key Vault-подобные сервисы, секреты оркестратора).

:::danger Пароли и ключи в appsettings.json
Всё, что попало в git, считается утёкшим — даже если потом удалить коммит. В `appsettings.json` — только несекретные значения и подсказки. Добавь в README, какие секреты нужно задать для запуска.
:::

### Шаг 7. Окружения

`ASPNETCORE_ENVIRONMENT` = `Development` / `Staging` / `Production`. От окружения зависят: какой `appsettings.{Env}.json` подключится, включены ли User Secrets, показывать ли подробности ошибок. `dotnet run` берёт окружение из `Properties/launchSettings.json` (там обычно `Development`). Если переменная не задана, окружение по умолчанию — `Production`: безопасное значение на случай, если забыли настроить сервер.

~~~csharp
var prod = WebApplication.CreateBuilder().Environment;
Console.WriteLine($"без переменной:  {prod.EnvironmentName}, IsDevelopment = {prod.IsDevelopment()}");

var dev = WebApplication.CreateBuilder(new WebApplicationOptions { EnvironmentName = "Development" }).Environment;
Console.WriteLine($"Development:     {dev.EnvironmentName}, IsDevelopment = {dev.IsDevelopment()}");
~~~
~~~console
без переменной:  Production, IsDevelopment = False
Development:     Development, IsDevelopment = True
~~~

Окружение влияет на безопасность: страница подробных ошибок со стеком вызовов — только в `Development`; в `Production` она раскрыла бы внутренности.

## Как это работает под капотом

- **Построитель и хост.** `WebApplication.CreateBuilder` создаёт «универсальный хост» (generic host): он владеет конфигурацией, DI-контейнером, логированием и жизненным циклом приложения. `app.Run()` запускает Kestrel и блокирует поток до сигнала остановки (Ctrl+C, SIGTERM от Docker), после чего корректно завершает работу — дожидается обработки текущих запросов.
- **Источники конфигурации — провайдеры.** Каждый источник (JSON-файл, переменные окружения, командная строка, user secrets) — отдельный провайдер; все они сводятся в один плоский словарь ключей вида `Pagination:MaxPageSize`. При чтении значения перебираются провайдеры **с конца к началу**, поэтому добавленный позже побеждает. Вложенный JSON превращается в двоеточия, массивы — в индексы (`Items:0`, `Items:1`).
- **Автоперезагрузка файлов.** `appsettings*.json` подключены с `reloadOnChange: true`: файловый наблюдатель замечает правку и обновляет значения; видят ли их твои классы — зависит от `IOptions`/`Snapshot`/`Monitor`.
- **Привязка секции к классу.** `Configure<T>(section)` создаёт объект `T` и по именам свойств заполняет их значениями из секции (строки приводятся к `int`, `bool`, `TimeSpan` и т. д.). Отсутствующее значение оставляет значение по умолчанию из класса — поэтому опечатка в имени ключа **молча** даёт значение по умолчанию. Отсюда польза проверки при старте.
- **Закрытый контейнер.** `Build()` превращает реестр сервисов в готовый провайдер; поэтому после него нельзя добавлять регистрации (мы это проверили).
- **Порядок важен.** Конвейер middleware строится в порядке вызовов `app.Use...` ([следующая тема](#p4-middleware)), а регистрации сервисов в `builder.Services` от порядка почти не зависят.
- **Переменные окружения и префиксы.** Хост читает переменные с префиксами `DOTNET_` (настройки хоста) и `ASPNETCORE_` (настройки веб-хоста: окружение, URL-ы); переменные без префикса попадают в общую конфигурацию приложения.
- **User Secrets** — обычный JSON-файл в каталоге профиля пользователя, подключаемый только в `Development`; идентификатор (`UserSecretsId`) записан в `.csproj`. Файл **не шифруется**.

## Типичные ошибки и ловушки

- **Пароли и ключи в `appsettings.json`.** Утечка через git.
- **Опечатка в ключе настройки.** `MaxPagesize` вместо `MaxPageSize` — значение молча остаётся по умолчанию. Лечится проверкой при старте.
- **Забытая переменная окружения на сервере.** Приложение берёт значения из `appsettings.json` для разработки (например, `localhost`) и не может подключиться; логируй, какое окружение запущено.
- **Регистрация сервисов после `Build()`.** `InvalidOperationException` — регистрации только до.
- **Чтение `IConfiguration` по всему коду.** Строковые ключи рассыпаются по проекту, опечатки не ловятся; используй Options.
- **`IOptions<T>` для значения, которое должно обновляться.** Застынет до перезапуска.
- **Нестандартные окружения без `appsettings.{Env}.json`.** Значения «не подхватились», потому что имя окружения написано иначе (`Staging` и `staging` на Linux — разные файлы).
- **`Development` в продакшене.** Подробные страницы ошибок раскрывают устройство приложения.
- **Секреты в аргументах командной строки.** Их видно в списке процессов и в истории оболочки.
- **Двойное подчёркивание перепутано с одинарным.** `Pagination_MaxPageSize` не превращается во вложенный ключ.
- **User Secrets в продакшене.** Это механизм для машины разработчика, а не хранилище для сервера.

## Вопросы с собеседований

:::spoiler В каком порядке применяются источники конфигурации?
appsettings.json → appsettings.{Environment}.json → User Secrets (в Development) → переменные окружения → аргументы командной строки. Последний источник с тем же ключом побеждает.
:::

:::spoiler Зачем Options pattern, если можно читать IConfiguration напрямую?
Типизация и проверка на этапе компиляции, значения по умолчанию, одно место привязки секции, возможность валидировать настройки при старте, удобная подмена в тестах.
:::

:::spoiler Почему User Secrets не подходят для продакшена?
Это механизм для машины разработчика: обычный JSON-файл в профиле пользователя, без шифрования и без управления доступом. В продакшене — переменные окружения или специализированное хранилище секретов.
:::

:::spoiler Чем IOptions, IOptionsSnapshot и IOptionsMonitor отличаются? (ловушка: «одно и то же»)
`IOptions` — singleton, читает один раз. `IOptionsSnapshot` — scoped, пересчитывается на каждый запрос. `IOptionsMonitor` — singleton, всегда актуальное значение и событие `OnChange`.
:::

:::spoiler Что делают `CreateBuilder` и `Build`?
`CreateBuilder` создаёт хост с умолчаниями (Kestrel, конфигурация, логирование, DI) и даёт регистрировать сервисы; `Build` закрывает контейнер и возвращает приложение, на котором настраивают конвейер и эндпоинты.
:::

:::spoiler Какое окружение по умолчанию, и почему?
`Production`, если `ASPNETCORE_ENVIRONMENT` не задана: безопасный вариант — не показывать подробные ошибки и не подключать dev-настройки по ошибке.
:::

:::spoiler Как передать строку подключения в Docker-контейнер, не меняя файлов?
Переменной окружения `ConnectionStrings__Default=...` (двойное подчёркивание вместо двоеточия). Секреты — только через окружение или хранилище, не в образе.
:::

:::spoiler Как приложению сообщить о неверной настройке сразу при старте?
`AddOptions<T>().BindConfiguration(...).ValidateDataAnnotations().ValidateOnStart()` — приложение не запустится и выведет список ошибок.
:::

## Что запомнить

- `Program.cs` в два этапа: до `Build()` регистрируем сервисы и настройки, после — описываем конвейер и эндпоинты.
- Конфигурация — слои: `appsettings.json` → `appsettings.{Env}.json` → user secrets → переменные окружения → аргументы; последний побеждает.
- Вложенность в переменных окружения — двойное подчёркивание (`A__B`).
- Читай настройки через Options: `IOptions` (один раз), `IOptionsSnapshot` (на запрос), `IOptionsMonitor` (всегда актуально).
- Проверяй настройки при старте (`ValidateDataAnnotations().ValidateOnStart()`).
- Секреты не в git: user secrets для разработки, переменные окружения/хранилище для сервера.
- Окружение по умолчанию — `Production`; подробные ошибки — только в `Development`.

## Практика

- [ ] Создал проект своего API, разобрал каждую строку `Program.cs` комментарием
- [ ] Вынес строку подключения и JWT-ключ в User Secrets, проверил, что в git их нет
- [ ] Сделал `PaginationOptions` через Options pattern и переопределил значение переменной окружения
- [ ] Добавил `appsettings.Development.json` с подробным логированием

@@page id="p4-endpoints" phase="4" kind="topic" title="Эндпоинты: контроллеры и minimal API" nav="Контроллеры и minimal API" est="~1 неделя"
:::why
Это то, как HTTP-запрос превращается в вызов твоего кода. В вакансиях встречаются оба стиля, поэтому нужно уметь читать и писать оба и понимать, что за кулисами у них одно и то же: роутинг, привязка параметров, результат.
:::

## Зачем это нужно

Все предыдущие темы — про то, *что* ходит по сети и *как* настроено приложение. Эта тема — про *кто* отвечает. Эндпоинт — это точка входа: пара «метод + путь» и код, который выполняется, когда такой запрос приходит. От того, как ты их описываешь, зависит читаемость API, количество шаблонного кода и то, насколько точно фреймворк опишет твой API другим (клиентам, документации, тестам).

В ASP.NET Core есть два способа описывать эндпоинты, и **оба встречаются в вакансиях и реальных проектах**:

- **Minimal API** — функции-обработчики, регистрируемые прямо в `Program.cs` (`app.MapGet(...)`). Появился в .NET 6, сейчас шаблон по умолчанию; хорош для небольших сервисов и новых проектов.
- **Контроллеры** — классы с атрибутами `[ApiController]`, `[HttpGet]`. Исторический стиль (MVC), по-прежнему стандарт в большинстве существующих проектов и больших командах.

Если ты умеешь только один стиль, ты не сможешь читать половину кодовых баз. К счастью, они построены на одном и том же: маршрутизация, привязка параметров, формирование результата. Разберёшь это — любой синтаксис станет вопросом привычки.

Типичные вопросы собеседования: «чем minimal API отличается от контроллеров?», «откуда берутся параметры метода?», «что делает `[ApiController]`?», «что такое `ActionResult<T>` и `TypedResults`?», «как сгруппировать эндпоинты?». В этой теме ты ответишь на все — на работающем сервере.

## Интуиция и аналогия

**Диспетчер и отделы.** Запрос приходит к диспетчеру (маршрутизатор): он читает «метод + путь» и решает, какому отделу передать. Отдел — это обработчик. В minimal API отдел — отдельный сотрудник с карточкой на двери (`app.MapGet("/tasks", ...)`). В контроллерах отдел — целый кабинет `TasksController`, где несколько сотрудников (методов) и общие правила (атрибуты, зависимости в конструкторе).

**Привязка параметров — секретарь, который раскладывает документы.** Запрос приносит данные из разных мест: часть в адресе (`/tasks/42`), часть в строке запроса (`?status=todo`), часть в теле (JSON), часть в заголовках. Секретарь (binder) раскладывает всё по параметрам твоего метода по понятным правилам. Тебе остаётся принять готовые `int id`, `string? status` и `CreateTaskRequest request`.

**Результат — штамп на ответе.** Твой код не пишет в сокет сам. Он возвращает *описание ответа* («создано, вот адрес и объект»), а фреймворк превращает его в статус, заголовки и тело. `TypedResults`/`ActionResult` — это набор штампов.

## Основная теория по шагам

### Шаг 1. Minimal API

~~~csharp Program.cs — минимальный работающий API @nocheck
using System.Collections.Concurrent;
using Microsoft.AspNetCore.Http.HttpResults;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddSingleton<TaskStore>();      // временное хранилище в памяти (до EF Core)
var app = builder.Build();

var tasks = app.MapGroup("/api/tasks");          // общий префикс

tasks.MapGet("/", (TaskStore store, string? status) =>
    TypedResults.Ok(store.All(status)));

tasks.MapGet("/{id:int}", Results<Ok<TaskDto>, NotFound> (int id, TaskStore store) =>
    store.Find(id) is { } task ? TypedResults.Ok(task) : TypedResults.NotFound());

tasks.MapPost("/", (CreateTaskRequest request, TaskStore store) =>
{
    var created = store.Add(request.Title);
    return TypedResults.Created($"/api/tasks/{created.Id}", created);
});

tasks.MapDelete("/{id:int}", Results<NoContent, NotFound> (int id, TaskStore store) =>
    store.Remove(id) ? TypedResults.NoContent() : TypedResults.NotFound());

app.Run();

public sealed record CreateTaskRequest(string Title);
public sealed record TaskDto(int Id, string Title, string Status);

public sealed class TaskStore
{
    private readonly ConcurrentDictionary<int, TaskDto> _items = new();
    private int _nextId;

    public IEnumerable<TaskDto> All(string? status) =>
        _items.Values.Where(t => status is null || t.Status.Equals(status, StringComparison.OrdinalIgnoreCase))
                     .OrderBy(t => t.Id);

    public TaskDto? Find(int id) => _items.GetValueOrDefault(id);

    public TaskDto Add(string title)
    {
        var task = new TaskDto(Interlocked.Increment(ref _nextId), title, "Todo");
        _items[task.Id] = task;
        return task;
    }

    public bool Remove(int id) => _items.TryRemove(id, out _);
}
~~~

Типы `Results<…>`, `Ok<T>`, `NotFound` живут в `Microsoft.AspNetCore.Http.HttpResults`. Тип ответа виден в сигнатуре и автоматически попадает в OpenAPI-документ: по `Results<Ok<TaskDto>, NotFound>` генератор знает, что эндпоинт отвечает `200` с задачей или `404`.

Чтобы убедиться, что всё работает, запустим этот же API и пройдём по нему клиентом. Единственное отличие от листинга выше — вместо `app.Run()` мы стартуем сервер на свободном порту и сами вызываем эндпоинты; а ещё вынесли регистрацию эндпоинтов в метод-расширение `MapTaskEndpoints` — так `Program.cs` не превращается в простыню:

~~~csharp
using System.Collections.Concurrent;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Http.HttpResults;

var builder = WebApplication.CreateBuilder();
builder.WebHost.UseUrls("http://127.0.0.1:0");
builder.Logging.ClearProviders();
builder.Services.AddSingleton<TaskStore>();
var app = builder.Build();

app.MapTaskEndpoints();                          // всё про задачи — в одном месте

await app.StartAsync();
using var http = new HttpClient { BaseAddress = new Uri(app.Urls.First()) };

async Task Show(string label, Task<HttpResponseMessage> call)
{
    var r = await call;
    var body = await r.Content.ReadAsStringAsync();
    var loc = r.Headers.Location is { } l ? $" Location={l}" : "";
    Console.WriteLine($"{label,-30} → {(int)r.StatusCode}{loc} {body}");
}

await Show("POST /api/tasks", http.PostAsJsonAsync("/api/tasks", new { title = "Форма входа" }));
await Show("POST /api/tasks", http.PostAsJsonAsync("/api/tasks", new { title = "Тесты" }));
await Show("GET  /api/tasks/1", http.GetAsync("/api/tasks/1"));
await Show("GET  /api/tasks/abc", http.GetAsync("/api/tasks/abc"));
await Show("GET  /api/tasks/99", http.GetAsync("/api/tasks/99"));
await Show("GET  /api/tasks?status=todo", http.GetAsync("/api/tasks?status=todo"));
await Show("GET  /api/tasks?status=done", http.GetAsync("/api/tasks?status=done"));
await Show("DELETE /api/tasks/1", http.DeleteAsync("/api/tasks/1"));
await Show("DELETE /api/tasks/1", http.DeleteAsync("/api/tasks/1"));
await app.StopAsync();

public static class TaskEndpoints
{
    public static IEndpointRouteBuilder MapTaskEndpoints(this IEndpointRouteBuilder app)
    {
        var tasks = app.MapGroup("/api/tasks");
        tasks.MapGet("/", (TaskStore store, string? status) => TypedResults.Ok(store.All(status)));
        tasks.MapGet("/{id:int}", Results<Ok<TaskDto>, NotFound> (int id, TaskStore store) =>
            store.Find(id) is { } task ? TypedResults.Ok(task) : TypedResults.NotFound());
        tasks.MapPost("/", (CreateTaskRequest request, TaskStore store) =>
        {
            var created = store.Add(request.Title);
            return TypedResults.Created($"/api/tasks/{created.Id}", created);
        });
        tasks.MapDelete("/{id:int}", Results<NoContent, NotFound> (int id, TaskStore store) =>
            store.Remove(id) ? TypedResults.NoContent() : TypedResults.NotFound());
        return app;
    }
}

public sealed record CreateTaskRequest(string Title);
public sealed record TaskDto(int Id, string Title, string Status);

public sealed class TaskStore
{
    private readonly ConcurrentDictionary<int, TaskDto> _items = new();
    private int _nextId;
    public IEnumerable<TaskDto> All(string? status) =>
        _items.Values.Where(t => status is null || t.Status.Equals(status, StringComparison.OrdinalIgnoreCase)).OrderBy(t => t.Id);
    public TaskDto? Find(int id) => _items.GetValueOrDefault(id);
    public TaskDto Add(string title) { var t = new TaskDto(Interlocked.Increment(ref _nextId), title, "Todo"); _items[t.Id] = t; return t; }
    public bool Remove(int id) => _items.TryRemove(id, out _);
}
~~~
~~~console
POST /api/tasks                → 201 Location=/api/tasks/1 {"id":1,"title":"Форма входа","status":"Todo"}
POST /api/tasks                → 201 Location=/api/tasks/2 {"id":2,"title":"Тесты","status":"Todo"}
GET  /api/tasks/1              → 200 {"id":1,"title":"Форма входа","status":"Todo"}
GET  /api/tasks/abc            → 404 
GET  /api/tasks/99             → 404 
GET  /api/tasks?status=todo    → 200 [{"id":1,"title":"Форма входа","status":"Todo"},{"id":2,"title":"Тесты","status":"Todo"}]
GET  /api/tasks?status=done    → 200 []
DELETE /api/tasks/1            → 204 
DELETE /api/tasks/1            → 404
~~~

Обрати внимание на `GET /api/tasks/abc`: ограничение `{id:int}` в маршруте отсекает запрос ещё при подборе маршрута, и до твоего кода дело не доходит — `404`, а не `500`.

### Шаг 2. Привязка параметров — откуда берутся значения

| Параметр | Откуда (по умолчанию) |
|---|---|
| `int id` при маршруте `/{id:int}` | из маршрута |
| `string? status` | из query string (`?status=todo`) |
| `CreateTaskRequest request` (сложный тип) | из JSON-тела |
| `TaskStore store` | из DI-контейнера |
| `HttpContext`, `CancellationToken`, `ClaimsPrincipal` | специальные типы, подставляются фреймворком |

Явно указать источник: `[FromRoute]`, `[FromQuery]`, `[FromBody]`, `[FromHeader]`, `[FromServices]`. Проверим все источники одним вызовом:

~~~csharp
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc;

var builder = WebApplication.CreateBuilder();
builder.WebHost.UseUrls("http://127.0.0.1:0");
builder.Logging.ClearProviders();
builder.Services.AddSingleton<Clock>();
var app = builder.Build();

app.MapPut("/demo/{id:int}", (
    int id,                                           // маршрут
    string? q,                                        // query string
    [FromHeader(Name = "X-Trace")] string? trace,     // заголовок
    Payload body,                                     // JSON-тело
    Clock clock,                                      // DI
    CancellationToken ct,                             // особый тип: отмена при обрыве соединения
    HttpContext ctx) =>                               // особый тип: весь контекст запроса
    new { id, q, trace, body.Title, clock = clock.Name, canCancel = ct.CanBeCanceled, path = ctx.Request.Path.Value });

await app.StartAsync();
using var http = new HttpClient { BaseAddress = new Uri(app.Urls.First()) };

using var req = new HttpRequestMessage(HttpMethod.Put, "/demo/5?q=abc") { Content = JsonContent.Create(new { title = "из тела" }) };
req.Headers.Add("X-Trace", "t-123");
var r = await http.SendAsync(req);
Console.WriteLine($"{(int)r.StatusCode} {await r.Content.ReadAsStringAsync()}");
await app.StopAsync();

record Payload(string Title);
class Clock { public string Name => "системные часы"; }
~~~
~~~console
200 {"id":5,"q":"abc","trace":"t-123","title":"из тела","clock":"системные часы","canCancel":true,"path":"/demo/5"}
~~~

Каждое значение пришло из своего места, а `Clock` фреймворк создал сам из DI-контейнера (подробнее — в теме про [DI](#p4-di)). Если параметр сложного типа стоит в `GET`-обработчике, фреймворк не станет искать его в теле (у `GET` тела нет по соглашению) и при первом обращении к такому эндпоинту ответит ошибкой `500` (в логе — исключение о том, что тело для этого метода не предполагается). Проверено на живом сервере; это защита от неочевидных ошибок.

### Шаг 3. Контроллеры — то же самое в классах

~~~csharp Controllers/TasksController.cs @nocheck
using Microsoft.AspNetCore.Mvc;

[ApiController]
[Route("api/tasks")]
public sealed class TasksController : ControllerBase
{
    private readonly TaskStore _store;
    public TasksController(TaskStore store) => _store = store;     // зависимости через конструктор

    [HttpGet]
    public IEnumerable<TaskDto> List([FromQuery] string? status) => _store.All(status);

    [HttpGet("{id:int}")]
    public ActionResult<TaskDto> Get(int id) =>
        _store.Find(id) is { } task ? task : NotFound();

    [HttpPost]
    public ActionResult<TaskDto> Create(CreateTaskRequest request)
    {
        var created = _store.Add(request.Title);
        return CreatedAtAction(nameof(Get), new { id = created.Id }, created);
    }
}
~~~

`[ApiController]` включает полезное поведение: автоматический ответ `400` с деталями при невалидной модели, вывод источника параметров, ответы об ошибках в формате ProblemDetails. В `Program.cs` нужны `builder.Services.AddControllers()` и `app.MapControllers()`.

Запустим контроллер и сравним поведение. Заодно посмотрим, чем отличается обработка неполного тела:

~~~csharp
using System.Collections.Concurrent;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc;

var builder = WebApplication.CreateBuilder();
builder.WebHost.UseUrls("http://127.0.0.1:0");
builder.Logging.ClearProviders();
builder.Services.AddSingleton<TaskStore>();
builder.Services.AddControllers();                      // ← для контроллеров
var app = builder.Build();

app.MapControllers();                                   // ← и это
app.MapPost("/minimal/tasks", (CreateTaskRequest request, TaskStore store) =>
    Results.Created("/minimal/tasks/1", store.Add(request.Title)));   // тот же запрос в minimal API

await app.StartAsync();
using var http = new HttpClient { BaseAddress = new Uri(app.Urls.First()) };

var created = await http.PostAsJsonAsync("/api/tasks", new { title = "Форма входа" });
Console.WriteLine($"контроллер, POST     → {(int)created.StatusCode} Location={created.Headers.Location!.AbsolutePath}");
Console.WriteLine($"контроллер, GET      → {(int)(await http.GetAsync("/api/tasks/1")).StatusCode}");
Console.WriteLine($"контроллер, GET 99   → {(int)(await http.GetAsync("/api/tasks/99")).StatusCode}");

var empty = new StringContent("{}", Encoding.UTF8, "application/json");
var bad = await http.PostAsync("/api/tasks", empty);
var problem = await bad.Content.ReadFromJsonAsync<JsonElement>();
Console.WriteLine($"контроллер, POST {{}}  → {(int)bad.StatusCode}, title: «{problem.GetProperty("title").GetString()}», поля с ошибками: " +
                  string.Join(", ", problem.GetProperty("errors").EnumerateObject().Select(p => p.Name)));

var mini = await http.PostAsync("/minimal/tasks", new StringContent("{}", Encoding.UTF8, "application/json"));
Console.WriteLine($"minimal API, POST {{}} → {(int)mini.StatusCode} {await mini.Content.ReadAsStringAsync()}");
await app.StopAsync();

[ApiController]
[Route("api/tasks")]
public sealed class TasksController(TaskStore store) : ControllerBase
{
    [HttpGet("{id:int}")]
    public ActionResult<TaskDto> Get(int id) => store.Find(id) is { } task ? task : NotFound();

    [HttpPost]
    public ActionResult<TaskDto> Create(CreateTaskRequest request)
    {
        var created = store.Add(request.Title);
        return CreatedAtAction(nameof(Get), new { id = created.Id }, created);
    }
}

public sealed record CreateTaskRequest(string Title);
public sealed record TaskDto(int Id, string Title, string Status);

public sealed class TaskStore
{
    private readonly ConcurrentDictionary<int, TaskDto> _items = new();
    private int _nextId;
    public TaskDto? Find(int id) => _items.GetValueOrDefault(id);
    public TaskDto Add(string? title) { var t = new TaskDto(Interlocked.Increment(ref _nextId), title ?? "(null)", "Todo"); _items[t.Id] = t; return t; }
}
~~~
~~~console
контроллер, POST     → 201 Location=/api/tasks/1
контроллер, GET      → 200
контроллер, GET 99   → 404
контроллер, POST {}  → 400, title: «One or more validation errors occurred.», поля с ошибками: Title
minimal API, POST {} → 201 {"id":2,"title":"(null)","status":"Todo"}
~~~

Контроллер с `[ApiController]` сам отклонил тело без `Title` ответом `400` в формате ProblemDetails (`non-nullable` свойство считается обязательным), а minimal API по умолчанию пропустил пустое тело в обработчик — проверка там включается отдельно (тема [валидации](#p4-validation)).

### Шаг 4. Что выбрать

| | Minimal API | Контроллеры |
|---|---|---|
| Код | компактный, всё рядом | классы, атрибуты, больше структуры |
| Группировка | `MapGroup`, методы-расширения | класс = группа эндпоинтов |
| Фильтры, валидация модели | endpoint filters | action filters, `[ApiController]` |
| Где чаще встречается | новые проекты, небольшие сервисы | большинство существующих проектов |

:::tip Совет для портфолио
Выбери **один** стиль для проекта и держись его. Хорошая структура для minimal API — по файлу на ресурс со статическим методом `MapTaskEndpoints(this IEndpointRouteBuilder app)`, чтобы `Program.cs` не превратился в простыню.
:::

Ни один стиль не «правильнее»: производительность у них сопоставима, а выбор — про структуру кода и привычки команды. Если проект растёт, важно не стиль эндпоинтов, а то, что в обработчике лежит *тонкая* логика (разбор запроса и формирование ответа), а бизнес-правила вынесены в сервисы — об этом тема про [слои](#p4-architecture).

### Шаг 5. Маршрутизация: шаблоны и ограничения

Шаблон маршрута — это путь с параметрами в фигурных скобках: `/api/tasks/{id:int}`. После двоеточия идёт ограничение: `int`, `guid`, `bool`, `min(1)`, `length(3,10)`, `regex(...)`. Если значение не подходит, маршрут не совпадает, и запрос продолжает искать другой (или получает `404`). Необязательный параметр помечают `?` (`{page?}`), значение по умолчанию задают так: `{page=1}`.

Одинаковые пути с разными методами — разные эндпоинты (`GET /api/tasks/{id}` и `DELETE /api/tasks/{id}`); если путь совпал, а метод нет — `405` (мы видели в теме про HTTP). Два эндпоинта с одинаково подходящими шаблонами и методами дают исключение `AmbiguousMatchException` — маршруты не должны пересекаться.

## Как это работает под капотом

- **Endpoint routing.** При старте все `MapGet`/`MapPost`/`MapControllers` превращаются в список *эндпоинтов* с шаблоном, методом, метаданными (атрибуты авторизации, тип ответа). Для каждого запроса middleware маршрутизации (`UseRouting`, в `WebApplication` подключается автоматически) выбирает подходящий эндпоинт и кладёт его в `HttpContext`; middleware, стоящие дальше (авторизация, CORS), читают метаданные выбранного эндпоинта; в конце запрос выполняет сам эндпоинт.
- **Как лямбда становится обработчиком.** Для minimal API `RequestDelegateFactory` анализирует сигнатуру лямбды (параметры, типы) и компилирует специализированный делегат `RequestDelegate`: он достаёт значения из запроса, вызывает твою лямбду и записывает результат. Компиляция происходит один раз при первом использовании эндпоинта; потом вызывается готовый код (поэтому ошибки привязки вроде «сложный тип в `GET`» всплывают при первом обращении к эндпоинту — как `500` — и сразу видны в логе).
- **Как контроллер становится обработчиком.** Для MVC строится конвейер *фильтров* вокруг действия: авторизация → ресурсные фильтры → привязка модели и валидация → фильтры действий → само действие → фильтры результата. `[ApiController]` добавляет в этот конвейер автоматическую проверку модели и ответ `400`. Экземпляр контроллера создаётся **на каждый запрос** (поэтому в его конструктор можно безопасно брать scoped-сервисы).
- **Привязка параметров** в minimal API идёт по правилам вывода: параметр из маршрута (если имя есть в шаблоне) → особые типы → сервис (если зарегистрирован в DI) → query (для простых типов) → тело (для сложных типов в `POST`/`PUT`/`PATCH`). Не угадывай — при неоднозначности указывай атрибут.
- **Форматирование результата.** `TypedResults.Ok(obj)` сериализует объект в JSON через `System.Text.Json` с настройками веб-умолчаний (camelCase), выставляет `Content-Type` и статус. `ActionResult<T>` позволяет вернуть либо `T` (станет `200`), либо результат-действие (`NotFound()`, `BadRequest()`).
- **`Results` и `TypedResults`.** `Results.Ok(...)` возвращает общий `IResult`; `TypedResults.Ok(...)` — конкретный тип `Ok<T>`, с которым компилятор и генераторы OpenAPI знают, какие ответы возможны. Для документации и тестов лучше `TypedResults`.
- **Асинхронность.** Обработчики с I/O (база, HTTP) пишут как `async Task<…>` и принимают `CancellationToken`: при обрыве соединения операция отменяется. Подробности — в Фазе 5.

## Типичные ошибки и ловушки

- **Смешивание стилей в проекте без причины.** Часть эндпоинтов в `Program.cs`, часть в контроллерах — трудно искать и поддерживать.
- **Бизнес-логика в обработчике или контроллере.** Тонкий слой разбора и ответа плюс сервис с правилами — иначе не протестируешь.
- **Сложный тип в `GET`-обработчике.** Тело в `GET` не ожидается: эндпоинт отвечает `500` с исключением в логе (проверено). Для фильтров используй простые параметры или `[AsParameters]`.
- **Возврат сущностей EF напрямую.** Утекают внутренние поля, возникают циклы ссылок; возвращай DTO ([слои и DTO](#p4-architecture)).
- **Неточные коды ответа.** `200` на создание, `500` на «не найдено» — клиент не может отреагировать правильно.
- **Пересекающиеся маршруты.** `AmbiguousMatchException` в рантайме; проверяй шаблоны, особенно `{id}` против литералов вроде `/active`.
- **Забытый `app.MapControllers()` или `AddControllers()`.** Контроллеры есть, но все запросы получают `404`.
- **Синхронный I/O в обработчике.** Блокирует поток пула и роняет пропускную способность; используй `async/await`.
- **Статические «хранилища» без потокобезопасности.** Запросы выполняются параллельно; обычный `Dictionary` в памяти ломается (учебный `TaskStore` использует `ConcurrentDictionary`).
- **Игнорирование `CancellationToken`.** Сервер продолжает работать над запросом, который клиент давно бросил.

## Вопросы с собеседований

:::spoiler Откуда minimal API берёт значение для параметра сложного типа и для зарегистрированного сервиса?
Сложный тип (record/класс запроса) — из JSON-тела. Зарегистрированный в DI тип — из контейнера.
:::

:::spoiler Почему POST должен возвращать 201 с Location, а не 200?
201 явно сообщает, что ресурс создан, а `Location` даёт его адрес — клиенту не нужно угадывать URL или делать лишний запрос.
:::

:::spoiler Чем minimal API отличается от контроллеров?
Тот же конвейер маршрутизации и привязки, разная форма: функции в `Program.cs`/методах-расширениях против классов с атрибутами и фильтрами MVC. Minimal API компактнее и легче; контроллеры — больше структуры и встроенное поведение `[ApiController]`.
:::

:::spoiler Что делает атрибут `[ApiController]`?
Включает автоматическую проверку модели (ответ `400` с ProblemDetails), вывод источника параметров (из тела — для сложных типов), ответы об ошибках в формате ProblemDetails, требует атрибутной маршрутизации.
:::

:::spoiler Что такое `TypedResults` и чем он лучше `Results`? (ловушка: «одно и то же»)
`TypedResults` возвращает конкретные типы (`Ok<T>`, `NotFound`), а `Results` — общий `IResult`. Типизированные результаты видны компилятору и генератору OpenAPI, поэтому документация и юнит-тесты точнее.
:::

:::spoiler Что делает ограничение `{id:int}` в маршруте?
Запрос совпадает с маршрутом, только если сегмент можно разобрать как `int`; иначе обработчик не вызывается (`404`), и не нужно писать проверку руками.
:::

:::spoiler Как создаётся экземпляр контроллера, и можно ли в его конструктор брать scoped-сервис?
Контроллер создаётся на каждый запрос, поэтому scoped-сервисы (например, `DbContext`) можно безопасно получать через конструктор.
:::

:::spoiler Как организовать много эндпоинтов в minimal API, чтобы `Program.cs` не раздулся?
Группировать через `MapGroup` и выносить регистрацию в методы-расширения `MapXxxEndpoints(this IEndpointRouteBuilder app)` по файлу на ресурс.
:::

## Что запомнить

- Эндпоинт — «метод + путь + обработчик»; два стиля описания: minimal API и контроллеры, под ними один и тот же конвейер.
- Параметры: маршрут → query (простые типы) → JSON-тело (сложные типы) → DI (сервисы) → особые типы (`HttpContext`, `CancellationToken`).
- Результат описываешь `TypedResults`/`ActionResult`, а не пишешь в ответ вручную; в сигнатуре видны возможные ответы.
- `[ApiController]` даёт автоматическую валидацию модели и ProblemDetails; в minimal API проверка включается отдельно.
- Ограничения маршрута (`{id:int}`) отсекают плохие запросы раньше твоего кода.
- В обработчике — тонкая логика; правила — в сервисах; наружу — DTO, а не сущности БД.
- Один стиль на проект; эндпоинты ресурса — в одном месте (`MapGroup` и метод-расширение).

## Практика

- [ ] Поднял minimal API из примера, проверил все эндпоинты через `.http`-файл или curl
- [ ] Переписал те же эндпоинты на контроллер и сравнил
- [ ] Вынес эндпоинты ресурса в метод-расширение `MapTaskEndpoints`
- [ ] Проверил ограничения маршрутов: `/api/tasks/abc` → 404, а не 500

@@page id="p4-middleware" phase="4" kind="topic" title="Middleware pipeline: через что проходит запрос" nav="Middleware" est="4–5 дней"
:::why
Ошибки вроде «авторизация не работает», «CORS не применяется», «исключение не ловится» почти всегда — **порядок middleware**. Цель — не заучить порядок, а понимать модель конвейера, чтобы выводить правильный порядок самостоятельно.
:::

## Зачем это нужно

Между сетевым соединением и твоим эндпоинтом происходит много общей работы: перенаправить на HTTPS, поймать необработанное исключение, прочитать токен, проверить права, разрешить кросс-доменный запрос, сжать ответ, записать в лог. Дублировать это в каждом эндпоинте нельзя — поэтому такая «сквозная» работа вынесена в цепочку обработчиков, через которую проходит **каждый** запрос. Эту цепочку называют *конвейером запроса* (request pipeline), а звенья — *middleware*.

Понимание конвейера нужно, потому что почти всё остальное в ASP.NET Core в него встроено: аутентификация и авторизация, CORS, обработка ошибок, логирование запросов, кэширование, rate limiting, статические файлы. И почти каждая загадочная ошибка в этой области — про то, *в каком порядке* и *с какими правами* всё это подключено:

- «Я добавил `[Authorize]`, но пользователь всё равно получает 401 с валидным токеном» — перепутан порядок.
- «Исключение в моём middleware не превращается в красивый ответ об ошибке» — обработчик исключений стоит не снаружи.
- «Браузер блокирует запрос с фронтенда, хотя CORS включён» — CORS стоит после аутентификации, а предварительный (preflight) запрос приходит без токена.
- «Заголовок, который я добавляю после вызова следующего звена, не появляется / падает исключение» — ответ уже начал отправляться.

На собеседованиях спрашивают: «что такое middleware?», «в каком порядке подключаются `UseAuthentication` и `UseAuthorization`, и почему?», «чем `Use`, `Run` и `Map` отличаются?», «как написать свой middleware?». Ты не просто заучишь ответы — мы запустим конвейеры и увидим порядок вызовов в выводе.

## Интуиция и аналогия

**Матрёшка вокруг эндпоинта.** Запрос — это путник, идущий к центру матрёшки: он проходит через внешние оболочки (middleware), входит в самое ядро (эндпоинт), а затем ответ идёт обратно тем же путём — через те же оболочки в обратном порядке. Каждая оболочка может что-то сделать на входе, что-то сделать на выходе и даже вообще не пустить путника дальше.

**Пропускной пункт в аэропорту.** Регистрация → паспортный контроль → досмотр → посадка. Нельзя пройти досмотр до паспортного контроля, если досмотр требует знать, кто ты (аутентификация → авторизация). Охранник на любом посту может развернуть тебя («короткое замыкание»), и до самолёта ты не дойдёшь. А если у кого-то случился инцидент в зале — обработкой инцидента занимается служба безопасности, стоящая **у главного входа**, чтобы видеть всё, что происходит внутри.

**Каждое звено — «до» и «после».** Звено получает запрос, делает что-то *до*, передаёт дальше (`await next(context)`), а когда дальнейшая цепочка вернулась — делает что-то *после*. Поэтому «замер времени» естественно оборачивает остальное: старт таймера до `next`, остановка после.

## Основная теория по шагам

### Шаг 1. Модель конвейера

~~~text
 запрос ──▶ [ExceptionHandler ──▶ [HTTPS ──▶ [Auth ──▶ [Authorization ──▶ ЭНДПОИНТ
 ответ ◀──   ExceptionHandler ◀──  HTTPS ◀──  Auth ◀──  Authorization ◀──    ]]]]
~~~

Каждый middleware получает запрос, может что-то сделать **до**, вызвать следующий (`next`) и что-то сделать **после**. А может и не вызывать `next` — тогда запрос дальше не идёт («короткое замыкание»: например, 401 без токена).

Покажем это прямо. Три звена пишут в журнал «вошёл» и «вышел», внутри — эндпоинт:

~~~csharp
var builder = WebApplication.CreateBuilder();
builder.WebHost.UseUrls("http://127.0.0.1:0");
builder.Logging.ClearProviders();
var app = builder.Build();

var log = new List<string>();

app.Use(async (ctx, next) => { log.Add("A: вход");  await next(ctx); log.Add("A: выход"); });
app.Use(async (ctx, next) => { log.Add("B: вход");  await next(ctx); log.Add("B: выход"); });
app.Use(async (ctx, next) => { log.Add("C: вход");  await next(ctx); log.Add("C: выход"); });
app.MapGet("/ping", () => { log.Add("   эндпоинт"); return "pong"; });

await app.StartAsync();
using var http = new HttpClient { BaseAddress = new Uri(app.Urls.First()) };
Console.WriteLine("ответ: " + await http.GetStringAsync("/ping"));
Console.WriteLine(string.Join(Environment.NewLine, log));
await app.StopAsync();
~~~
~~~console
ответ: pong
A: вход
B: вход
C: вход
   эндпоинт
C: выход
B: выход
A: выход
~~~

Звенья вызываются в порядке регистрации «на вход» и в обратном порядке «на выход». Точка вызова `await next(ctx)` делит работу звена на «до» и «после».

### Шаг 2. Короткое замыкание

Звено может не вызывать `next` и само сформировать ответ. Так работают аутентификация (нет токена → `401`), CORS preflight, кэш ответов, rate limiting, перенаправление на HTTPS.

~~~csharp
var builder = WebApplication.CreateBuilder();
builder.WebHost.UseUrls("http://127.0.0.1:0");
builder.Logging.ClearProviders();
var app = builder.Build();

var endpointCalls = 0;

app.Use(async (ctx, next) =>
{
    if (!ctx.Request.Headers.ContainsKey("X-Api-Key"))
    {
        ctx.Response.StatusCode = 401;                    // не вызываем next → дальше запрос не идёт
        await ctx.Response.WriteAsync("нужен X-Api-Key");
        return;
    }
    await next(ctx);
});
app.MapGet("/data", () => { endpointCalls++; return "секретные данные"; });

await app.StartAsync();
using var http = new HttpClient { BaseAddress = new Uri(app.Urls.First()) };

var r1 = await http.GetAsync("/data");
Console.WriteLine($"без ключа: {(int)r1.StatusCode} «{await r1.Content.ReadAsStringAsync()}», эндпоинт вызван раз: {endpointCalls}");

using var withKey = new HttpRequestMessage(HttpMethod.Get, "/data");
withKey.Headers.Add("X-Api-Key", "k");
var r2 = await http.SendAsync(withKey);
Console.WriteLine($"с ключом:  {(int)r2.StatusCode} «{await r2.Content.ReadAsStringAsync()}», эндпоинт вызван раз: {endpointCalls}");
await app.StopAsync();
~~~
~~~console
без ключа: 401 «нужен X-Api-Key», эндпоинт вызван раз: 0
с ключом:  200 «секретные данные», эндпоинт вызван раз: 1
~~~

### Шаг 3. Use, Run и Map

- `app.Use(async (ctx, next) => …)` — обычное звено: может вызвать `next`.
- `app.Run(async ctx => …)` — **терминальное** звено: `next` у него нет, оно всегда завершает конвейер (всё, что зарегистрировано после него, недостижимо).
- `app.Map("/health", branch => …)` — **ветка**: запросы с указанным префиксом уходят в отдельный мини-конвейер.
- `app.UseWhen(условие, branch => …)` — ветка, после которой запрос возвращается в основной конвейер.

Эндпоинты (`MapGet`, `MapControllers`) — тоже, по сути, конец конвейера: запрос, дошедший до них, выполняется.

### Шаг 4. Свой middleware: замер времени запроса

~~~csharp Program.cs @nocheck
using System.Diagnostics;

var builder = WebApplication.CreateBuilder(args);
var app = builder.Build();

app.Use(async (context, next) =>
{
    var sw = Stopwatch.StartNew();
    await next(context);                                       // всё остальное — внутри этой строки
    sw.Stop();
    app.Logger.LogInformation("{Method} {Path} → {Status} за {Elapsed} мс",
        context.Request.Method, context.Request.Path, context.Response.StatusCode, sw.ElapsedMilliseconds);
});

app.MapGet("/ping", () => "pong");
app.Run();
~~~

~~~csharp Тот же middleware классом — для повторного использования @nocheck
public sealed class RequestTimingMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<RequestTimingMiddleware> _logger;

    public RequestTimingMiddleware(RequestDelegate next, ILogger<RequestTimingMiddleware> logger)
    {
        _next = next;
        _logger = logger;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        long start = Stopwatch.GetTimestamp();
        await _next(context);
        _logger.LogInformation("{Path} за {Elapsed} мс", context.Request.Path,
            Stopwatch.GetElapsedTime(start).TotalMilliseconds);
    }
}

// app.UseMiddleware<RequestTimingMiddleware>();
~~~

Запишем результат не только в журнал, но и в заголовок ответа — и тут появляется тонкость. Заголовки уходят клиенту **раньше тела**: как только эндпоинт начал писать тело, менять заголовки уже поздно. Поэтому действие «после `next`» над заголовками нельзя делать напрямую — используют `Response.OnStarting`, который вызывается прямо перед отправкой заголовков.

~~~csharp
using System.Diagnostics;

var builder = WebApplication.CreateBuilder();
builder.WebHost.UseUrls("http://127.0.0.1:0");
builder.Logging.ClearProviders();
var app = builder.Build();
var notes = new List<string>();      // сообщения сервера соберём и напечатаем в конце (порядок вывода стабилен)

// ❌ после next заголовки менять поздно: ответ уже отправлен
app.Map("/bad", branch =>
{
    branch.Use(async (ctx, next) =>
    {
        await next(ctx);
        notes.Add($"/bad:  после next ответ уже начался: {ctx.Response.HasStarted}");
        try { ctx.Response.Headers["X-Late"] = "1"; }
        catch (InvalidOperationException ex) { notes.Add("/bad:  " + ex.Message); }
    });
    branch.Run(ctx => ctx.Response.WriteAsync("тело"));
});

// ✅ OnStarting вызывается перед отправкой заголовков
app.Map("/good", branch =>
{
    branch.Use(async (ctx, next) =>
    {
        var start = Stopwatch.GetTimestamp();
        ctx.Response.OnStarting(() =>
        {
            ctx.Response.Headers["X-Elapsed-Ms"] = Stopwatch.GetElapsedTime(start).TotalMilliseconds.ToString("F0");
            return Task.CompletedTask;
        });
        await next(ctx);
    });
    branch.Run(ctx => ctx.Response.WriteAsync("тело"));
});

await app.StartAsync();
using var http = new HttpClient { BaseAddress = new Uri(app.Urls.First()) };

var bad = await http.GetAsync("/bad");
Console.WriteLine($"/bad:  клиент получил статус {(int)bad.StatusCode}, заголовок X-Late есть: {bad.Headers.Contains("X-Late")}");

var good = await http.GetAsync("/good");
Console.WriteLine($"/good: статус {(int)good.StatusCode}, заголовок X-Elapsed-Ms есть: {good.Headers.Contains("X-Elapsed-Ms")}");
await Task.Delay(200);
foreach (var n in notes) Console.WriteLine("сервер: " + n);
await app.StopAsync();
~~~
~~~console
/bad:  клиент получил статус 200, заголовок X-Late есть: False
/good: статус 200, заголовок X-Elapsed-Ms есть: True
сервер: /bad:  после next ответ уже начался: True
сервер: /bad:  Headers are read-only, response has already started.
~~~

:::warn Scoped-сервисы в middleware
Класс middleware создаётся **один раз** на всё приложение (фактически синглтон). Scoped-сервис (например, `DbContext`) нельзя брать в его конструктор — принимай его параметром метода `InvokeAsync(HttpContext context, AppDbContext db)`. Подробнее — в [DI](#p4-di).
:::

Проверим это правило на практике: middleware с scoped-зависимостью в конструкторе и в `InvokeAsync`. Идентификатор scoped-сервиса меняется на каждый запрос — смотрим, какой из двух экземпляров «залипает»:

~~~csharp
var builder = WebApplication.CreateBuilder();
builder.WebHost.UseUrls("http://127.0.0.1:0");
builder.Logging.ClearProviders();
builder.Services.AddScoped<RequestId>();
var app = builder.Build();

app.UseMiddleware<IdsMiddleware>();
app.MapGet("/", () => "ок");

await app.StartAsync();
using var http = new HttpClient { BaseAddress = new Uri(app.Urls.First()) };
for (var i = 1; i <= 2; i++) await http.GetAsync("/");
await app.StopAsync();

public sealed class RequestId { public string Value { get; } = Guid.NewGuid().ToString("N")[..6]; }

public sealed class IdsMiddleware(RequestDelegate next, RequestId fromCtor)
{
    private static readonly HashSet<string> CtorIds = new(), InvokeIds = new();
    private static int _calls;

    public async Task InvokeAsync(HttpContext ctx, RequestId fromInvoke)
    {
        CtorIds.Add(fromCtor.Value); InvokeIds.Add(fromInvoke.Value);
        Console.WriteLine($"запрос {++_calls}: разных id из конструктора = {CtorIds.Count}, из InvokeAsync = {InvokeIds.Count}");
        await next(ctx);
    }
}
~~~
~~~console
запрос 1: разных id из конструктора = 1, из InvokeAsync = 1
запрос 2: разных id из конструктора = 1, из InvokeAsync = 2
~~~

Экземпляр из конструктора «залип» навсегда (в Production контейнер не проверяет такие ошибки), а экземпляр из `InvokeAsync` свой на каждый запрос. В режиме `Development` контейнер включает проверку областей и такая регистрация падает сразу — об этом подробнее в теме про [DI](#p4-di).

### Шаг 5. Типичный порядок и почему он такой

~~~csharp @nocheck
app.UseExceptionHandler();      // 1. самым внешним: ловит исключения ВСЕХ, кто внутри
app.UseHttpsRedirection();      // 2. до всего, что работает с содержимым
app.UseCors();                  // 3. до аутентификации: preflight-запросы браузера без токена
app.UseAuthentication();        // 4. «кто ты?» — читает токен, заполняет HttpContext.User
app.UseAuthorization();         // 5. «можно ли тебе?» — использует User, поэтому ПОСЛЕ аутентификации
app.MapControllers();           // 6. эндпоинты
~~~

Вывод правила вместо заучивания: **обработчик ошибок — снаружи всего**, потому что ловит только то, что внутри него; **авторизация после аутентификации**, потому что ей нужен результат аутентификации; эндпоинты — в самом конце.

### Шаг 6. Обработчик исключений: почему он первый

Два одинаковых приложения; в одном обработчик исключений стоит перед «ломающимся» звеном, в другом — после:

~~~csharp
using Microsoft.AspNetCore.Builder;

async Task<string> Run(bool handlerFirst)
{
    var builder = WebApplication.CreateBuilder();
    builder.WebHost.UseUrls("http://127.0.0.1:0");
    builder.Logging.ClearProviders();
    var app = builder.Build();

    void Handler() => app.UseExceptionHandler(b => b.Run(async ctx =>
    {
        ctx.Response.StatusCode = 500;
        await ctx.Response.WriteAsync("обработано: что-то пошло не так");
    }));
    void Breaker() => app.Use(async (ctx, next) =>
    {
        if (ctx.Request.Path == "/") throw new InvalidOperationException("сломалось");
        await next(ctx);
    });

    if (handlerFirst) { Handler(); Breaker(); } else { Breaker(); Handler(); }
    app.MapGet("/", () => "ок");

    await app.StartAsync();
    using var http = new HttpClient { BaseAddress = new Uri(app.Urls.First()) };
    var r = await http.GetAsync("/");
    var body = await r.Content.ReadAsStringAsync();
    await app.StopAsync();
    return $"{(int)r.StatusCode}, тело: «{body}»";
}

Console.WriteLine("обработчик первым:    " + await Run(handlerFirst: true));
Console.WriteLine("обработчик после:     " + await Run(handlerFirst: false));
~~~
~~~console
обработчик первым:    500, тело: «обработано: что-то пошло не так»
обработчик после:     500, тело: «»
~~~

Когда обработчик стоит позже «ломающегося» звена, он до исключения просто не доходит: тело пустое, клиент получает голый `500`, а в проде — ещё и непонятный ответ без деталей.

### Шаг 7. Аутентификация и авторизация: порядок решает

Чтобы показать эту пару без внешних библиотек, напишем крошечную схему аутентификации: «заголовок `X-Token: valid` значит, что ты вошёл».

~~~csharp
using System.Security.Claims;
using System.Text.Encodings.Web;
using Microsoft.AspNetCore.Authentication;
using Microsoft.Extensions.Options;

async Task<string> Run(bool correctOrder)
{
    var builder = WebApplication.CreateBuilder();
    builder.WebHost.UseUrls("http://127.0.0.1:0");
    builder.Logging.ClearProviders();
    builder.Services.AddAuthentication("Header").AddScheme<AuthenticationSchemeOptions, HeaderAuthHandler>("Header", null);
    builder.Services.AddAuthorization();
    var app = builder.Build();

    if (correctOrder) { app.UseAuthentication(); app.UseAuthorization(); }
    else              { app.UseAuthorization();  app.UseAuthentication(); }

    app.MapGet("/secret", (ClaimsPrincipal user) => $"привет, {user.Identity!.Name}").RequireAuthorization();

    await app.StartAsync();
    using var http = new HttpClient { BaseAddress = new Uri(app.Urls.First()) };
    var anonymous = await http.GetAsync("/secret");
    using var req = new HttpRequestMessage(HttpMethod.Get, "/secret");
    req.Headers.Add("X-Token", "valid");
    var withToken = await http.SendAsync(req);
    await app.StopAsync();
    return $"без токена → {(int)anonymous.StatusCode}, с токеном → {(int)withToken.StatusCode}";
}

Console.WriteLine("Authentication → Authorization: " + await Run(correctOrder: true));
Console.WriteLine("Authorization → Authentication: " + await Run(correctOrder: false));

class HeaderAuthHandler(IOptionsMonitor<AuthenticationSchemeOptions> options, ILoggerFactory logger, UrlEncoder encoder)
    : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
{
    protected override Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        if (Request.Headers["X-Token"] != "valid") return Task.FromResult(AuthenticateResult.NoResult());
        var identity = new ClaimsIdentity([new Claim(ClaimTypes.Name, "Валера")], Scheme.Name);
        return Task.FromResult(AuthenticateResult.Success(new AuthenticationTicket(new ClaimsPrincipal(identity), Scheme.Name)));
    }
}
~~~
~~~console
Authentication → Authorization: без токена → 401, с токеном → 200
Authorization → Authentication: без токена → 401, с токеном → 401
~~~

## Как это работает под капотом

- **Что такое middleware технически.** Это функция `RequestDelegate → RequestDelegate`: принимает «следующее звено» и возвращает новое звено. `app.Use(...)` складывает такие функции в список, а при старте `Build()` свёртывает список в одну вложенную цепочку делегатов. Каждый запрос просто вызывает первый делегат, а остальные вызываются по цепочке через `next`.
- **Порядок вызовов — это порядок регистрации.** Никакой магии приоритетов нет: что зарегистрировано раньше, то снаружи. Поэтому «правильный порядок» — следствие того, кому какие данные нужны (авторизации нужен результат аутентификации; обработчику ошибок нужно видеть исключения всех остальных).
- **Класс-middleware и жизненный цикл.** Конвенциональный middleware (с методом `Invoke`/`InvokeAsync`) создаётся один раз при построении конвейера, зависимости конструктора разрешаются из корневого провайдера; зависимости `InvokeAsync` — на каждый запрос из scope запроса. Альтернатива — реализовать `IMiddleware` и зарегистрировать как сервис: тогда экземпляр создаётся фабрикой на каждый запрос, и scoped-зависимости в конструкторе допустимы.
- **Неявные middleware.** `WebApplication` сам подключает маршрутизацию (`UseRouting`) в начале и выполнение эндпоинтов в конце; если зарегистрированы сервисы аутентификации/авторизации, он может подключить соответствующие middleware автоматически. Явный вызов `UseAuthentication`/`UseAuthorization` задаёт порядок осознанно — и именно его читают на код-ревью.
- **Эндпоинт-осведомлённые middleware.** Авторизация и CORS читают *метаданные выбранного эндпоинта* (`[Authorize]`, `RequireAuthorization()`), поэтому им нужно, чтобы маршрутизация уже выбрала эндпоинт; в современных шаблонах это обеспечено автоматически.
- **Заголовки и тело.** Ответ состоит из статуса, заголовков и тела; как только первые байты тела отправлены, статус и заголовки изменить нельзя. Для действий «в конце, но с заголовками» служит `OnStarting`; для действий «после отправки» — `OnCompleted`.
- **Асинхронность.** Все звенья асинхронные; забытый `await next(ctx)` приводит к тому, что звено вернётся раньше конца обработки, и ответ может быть отправлен до того, как эндпоинт закончит.
- **Стоимость.** Каждое звено — вызов делегата; десяток звеньев на запрос стоят микросекунды. Дорогим бывает *содержимое* звена (чтение тела, обращения к базе), а не их число.

## Типичные ошибки и ловушки

- **Неверный порядок аутентификации и авторизации.** Пользователь с валидным токеном получает `401` (мы это воспроизвели).
- **Обработчик исключений не первым.** Ошибки внешних звеньев мимо него: голый `500` без деталей.
- **Забытый `await next(context)` или вызов `next` дважды.** В первом случае эндпоинт не выполняется, во втором — выполняется дважды.
- **Запись в тело до `next`, а затем вызов `next`.** Ответ уже начался, и последующие звенья не смогут менять заголовки.
- **Изменение заголовков после `next`.** Заголовки уже ушли; используй `OnStarting`.
- **Scoped-сервис в конструкторе middleware.** «Залипает» на первый запрос или падает в Development; бери его в `InvokeAsync`.
- **Чтение тела запроса в middleware без `EnableBuffering`.** Поток читается один раз; последующий эндпоинт получит пустое тело.
- **Тяжёлая работа в middleware, выполняющемся для каждого запроса.** Статические файлы, health-check и прочее лучше отсекать ветками (`Map`, `UseWhen`).
- **CORS после аутентификации.** Preflight-запросы браузера идут без токена и получают `401`.
- **Недостижимые звенья после `Run`.** Всё, что зарегистрировано после терминального звена, не выполнится.
- **Доверие неявному порядку.** Не полагайся на автоматическое подключение middleware: пиши вызовы явно и в нужном порядке.

## Вопросы с собеседований

:::spoiler Что будет, если поставить UseAuthorization перед UseAuthentication?
Авторизация выполнится, когда пользователь ещё не определён: `User` анонимный, и защищённые эндпоинты будут отвечать 401 даже с валидным токеном.
:::

:::spoiler Почему обработчик исключений регистрируют первым?
Middleware ловит исключения только из того, что вызывается внутри него (после него в конвейере). Чтобы перехватить ошибки всех остальных этапов, он должен быть самым внешним.
:::

:::spoiler Что такое «короткое замыкание» конвейера?
Middleware не вызывает `next` и сам формирует ответ — например, 401 при отсутствии токена или ответ из кэша. Следующие этапы и эндпоинт не выполняются.
:::

:::spoiler Чем `Use`, `Run` и `Map` отличаются?
`Use` — звено с доступом к `next`. `Run` — терминальное звено без `next`. `Map` — ветка конвейера по префиксу пути (`UseWhen` — ветка по условию, с возвратом в основной конвейер).
:::

:::spoiler Почему нельзя взять scoped-сервис в конструктор middleware? (ловушка: «можно, контейнер всё подставит»)
Конвенциональный middleware создаётся один раз и живёт всё время работы приложения: scoped-сервис «залипнет» на первом запросе (в Development контейнер даже откажется собирать такую цепочку). Scoped-зависимости берут параметрами `InvokeAsync` или используют `IMiddleware`.
:::

:::spoiler Как добавить заголовок в ответ после выполнения эндпоинта?
Через `Response.OnStarting(...)` — обработчик вызывается прямо перед отправкой заголовков. Прямое изменение заголовков после `await next(ctx)` не сработает: ответ уже начал отправляться.
:::

:::spoiler Где в конвейере должен стоять CORS и почему?
До аутентификации и авторизации: браузер предварительно отправляет preflight-запрос (`OPTIONS`) без токена, и его нужно обработать до проверки прав.
:::

:::spoiler Что такое middleware «под капотом»?
Функция, принимающая следующий делегат и возвращающая делегат; `Build()` складывает их в цепочку, а порядок цепочки — порядок регистрации.
:::

## Что запомнить

- Конвейер — матрёшка: звенья вызываются в порядке регистрации на вход и в обратном — на выход; `await next(ctx)` делит звено на «до» и «после».
- Звено может не вызывать `next` (короткое замыкание): так отвечает `401`, кэш, rate limiting.
- Порядок выводится из зависимостей: обработчик ошибок — снаружи, аутентификация перед авторизацией, CORS до обеих, эндпоинты — в конце.
- Заголовки нельзя менять после начала тела; для «после» — `OnStarting`.
- Scoped-сервисы в middleware — только параметрами `InvokeAsync` (или через `IMiddleware`).
- `Use` — звено, `Run` — терминальное, `Map`/`UseWhen` — ветки.
- Порядок проверяй не чтением, а запросом: запусти и посмотри, кто что получил.

## Практика

- [ ] Написал middleware замера времени двумя способами и подключил к проекту
- [ ] Написал middleware, который добавляет заголовок `X-Request-Id` (из запроса или новый GUID) в ответ
- [ ] Намеренно переставил `UseAuthentication` и `UseAuthorization`, увидел 401, вернул обратно
- [ ] Нарисовал конвейер своего проекта со стрелками «до/после»

@@page id="p4-di" phase="4" kind="topic" title="Dependency Injection: Scoped, Transient, Singleton" nav="DI и lifetimes" est="~1 неделя"
:::why
**Второй пункт критерия:** объяснить Scoped/Transient/Singleton на конкретном баге. Перепутанный lifetime — классическая ошибка джунов с `DbContext`: странные данные между запросами, исключения «A second operation was started on this context», утечки памяти. Здесь ты эти баги воспроизведёшь сам.
:::

## Зачем это нужно

Любой нетривиальный сервис состоит из десятков объектов, которые друг от друга зависят: контроллер использует сервис задач, сервис задач — репозиторий и часы, репозиторий — `DbContext`, `DbContext` — настройки. Если создавать их вручную (`new TaskService(new TaskRepository(new AppDbContext(...), new Clock()))`), код превращается в клубок: каждое изменение конструктора ломает все места создания, подменить зависимость в тесте невозможно, а вопрос «кто и когда освободит ресурсы?» остаётся без ответа.

**Dependency Injection (внедрение зависимостей)** снимает это: объект не создаёт свои зависимости сам, а *получает* их снаружи (обычно через конструктор). Создание и освобождение объектов берёт на себя **DI-контейнер**: ты один раз регистрируешь «что у нас есть и на сколько живёт», а дальше просто просишь нужный тип.

Главная тонкость — **время жизни** (lifetime): один объект на всё приложение, на каждый запрос или на каждое обращение. Перепутанное время жизни не проявляется в простых тестах и ломает приложение при реальной нагрузке:

- пользователи видят чужие данные (состояние запроса сохранилось в «вечном» объекте);
- падают запросы с «A second operation was started on this context instance» (один `DbContext` на всех);
- растёт память (каждый запрос оставляет за собой неосвобождённые объекты);
- данные «залипают» и не обновляются (кэш в `DbContext`).

Тема встречается почти в каждом собеседовании: «Чем Scoped отличается от Transient и Singleton?», «Что будет, если Singleton зависит от Scoped?», «Почему `DbContext` — scoped?», «Что такое Captive Dependency?». Хороший ответ строится на собственном баге — и сегодня ты поймаешь все три руками, на настоящем сервере.

## Интуиция и аналогия

**Кофейня.** Контейнер — управляющий, который решает, откуда берётся посуда.

- **Transient** — одноразовый стаканчик: каждому, кто просит, дают новый.
- **Scoped** — кружка на один визит (на один HTTP-запрос): пока ты сидишь за столиком, тебе приносят одну и ту же кружку; когда ушёл — её моют и отдают следующему посетителю уже как другую.
- **Singleton** — кофемашина на всю кофейню: одна для всех и всегда. Всё, что в ней «осталось» от одного посетителя, видят и остальные.

**Правило долгов.** Кофемашина (долгоживущая) не должна хранить у себя кружку одного посетителя (короткоживущую): тогда эта кружка будет «жить» вечно, а чужие посетители будут пить из неё. Это и есть *captive dependency*: долгоживущий объект «берёт в плен» короткоживущий.

**Заказ по меню, а не готовка самому.** Официант (класс) не бежит на кухню за каждой деталью — он говорит «мне нужен кофе», и ему приносят. Он не знает, кто и как готовит, зато его легко проверить на «фальшивом» кофе в тесте.

## Основная теория по шагам

### Шаг 1. Что делает контейнер

Ты регистрируешь: «когда кто-то просит `ITaskService`, дай `TaskService`». Контейнер сам создаёт объекты и передаёт зависимости в конструкторы (всю цепочку). Это реализация принципа [D из SOLID](#p2-solid).

~~~csharp @nocheck
builder.Services.AddScoped<ITaskService, TaskService>();
builder.Services.AddSingleton<IClock, SystemClock>();
builder.Services.AddTransient<IEmailFormatter, EmailFormatter>();
builder.Services.AddDbContext<AppDbContext>(o => o.UseNpgsql(cs));   // DbContext — Scoped по умолчанию
~~~

Контейнер строит граф зависимостей по конструкторам: если `TaskService(ITaskRepository repo, IClock clock)`, а `TaskRepository(AppDbContext db)`, то для `ITaskService` он создаст `AppDbContext`, затем `TaskRepository`, затем `TaskService`, подставив нужные экземпляры — по времени жизни каждого.

### Шаг 2. Три времени жизни

| Lifetime | Экземпляр | Типичные примеры |
|---|---|---|
| **Transient** | новый при **каждом** запросе зависимости | лёгкие сервисы без состояния |
| **Scoped** | один на **HTTP-запрос** (scope) | `DbContext`, сервисы бизнес-логики, текущий пользователь |
| **Singleton** | один на **всё приложение** | `IClock`, кэш в памяти, настройки, `HttpClient`-фабрика |

### Шаг 3. Увидеть своими глазами

Зарегистрируем по одному сервису каждого типа и по каждому будем возвращать идентификатор экземпляра. `Consumer` — ещё один scoped-сервис, который тоже получает все три зависимости в конструкторе. Если контейнер выдаёт один и тот же экземпляр, идентификаторы совпадут.

~~~csharp
using System.Net.Http.Json;
using System.Text.Json;

var builder = WebApplication.CreateBuilder();
builder.WebHost.UseUrls("http://127.0.0.1:0");
builder.Logging.ClearProviders();
builder.Services.AddTransient<TransientDep>();
builder.Services.AddScoped<ScopedDep>();
builder.Services.AddSingleton<SingletonDep>();
builder.Services.AddScoped<Consumer>();
var app = builder.Build();

app.MapGet("/ids", (Consumer c, TransientDep t, ScopedDep s, SingletonDep g) => new
{
    transient = new[] { c.T.Id, t.Id },     // два разных обращения в одном запросе
    scoped    = new[] { c.S.Id, s.Id },
    singleton = new[] { c.G.Id, g.Id },
});

await app.StartAsync();
using var http = new HttpClient { BaseAddress = new Uri(app.Urls.First()) };
var first  = await http.GetFromJsonAsync<JsonElement>("/ids");
var second = await http.GetFromJsonAsync<JsonElement>("/ids");

string Id(JsonElement r, string kind, int i) => r.GetProperty(kind)[i].GetString()!;
foreach (var kind in new[] { "transient", "scoped", "singleton" })
    Console.WriteLine($"{kind,-9} внутри запроса одинаковые: {Id(first, kind, 0) == Id(first, kind, 1),-5}  между запросами одинаковые: {Id(first, kind, 0) == Id(second, kind, 0)}");
await app.StopAsync();

public abstract class Dep { public string Id { get; } = Guid.NewGuid().ToString()[..8]; }
public sealed class TransientDep : Dep;
public sealed class ScopedDep : Dep;
public sealed class SingletonDep : Dep;
public sealed class Consumer(TransientDep t, ScopedDep s, SingletonDep g)
{
    public TransientDep T { get; } = t;
    public ScopedDep S { get; } = s;
    public SingletonDep G { get; } = g;
}
~~~
~~~console
transient внутри запроса одинаковые: False  между запросами одинаковые: False
scoped    внутри запроса одинаковые: True   между запросами одинаковые: False
singleton внутри запроса одинаковые: True   между запросами одинаковые: True
~~~

Таблица из трёх строк полностью описывает суть: **transient** — всегда новый; **scoped** — один в пределах запроса и новый в следующем; **singleton** — один навсегда.

### Шаг 4. Баги, которые нужно поймать руками {#bugs}

#### Баг 1: Captive dependency — Scoped внутри Singleton

~~~csharp @nocheck
builder.Services.AddSingleton<ReportCache>();          // ❌ синглтон...
builder.Services.AddDbContext<AppDbContext>(...);      // ...зависит от scoped DbContext

public sealed class ReportCache(AppDbContext db) { /* ... */ }
~~~

Синглтон живёт вечно и «захватывает» `DbContext` первого запроса. Дальше все запросы всех пользователей используют **один** контекст: он не потокобезопасен (ошибка *A second operation was started on this context instance*), копит отслеживаемые сущности (растёт память) и отдаёт устаревшие данные.

Воспроизведём то же самое без базы: `AppDbContext` здесь — любой scoped-класс с идентификатором. Сначала контейнер с проверками (так он настроен в Development), потом без проверок (как в Production):

~~~csharp
using Microsoft.Extensions.DependencyInjection;

var services = new ServiceCollection();
services.AddScoped<AppDbContext>();
services.AddSingleton<ReportCache>();

try { services.BuildServiceProvider(new ServiceProviderOptions { ValidateScopes = true, ValidateOnBuild = true }); }
catch (Exception ex)
{
    var message = ex is AggregateException agg ? agg.InnerExceptions[0].Message : ex.Message;
    Console.WriteLine("с проверкой: " + message);
}

using var lax = services.BuildServiceProvider();          // без проверок
var cache = lax.GetRequiredService<ReportCache>();
for (var i = 1; i <= 3; i++)
{
    using var request = lax.CreateScope();
    var contextOfRequest = request.ServiceProvider.GetRequiredService<AppDbContext>();
    Console.WriteLine($"запрос {i}: свой контекст {contextOfRequest.Id}, контекст внутри синглтона {cache.Db.Id}");
}

public sealed class AppDbContext { static int _count; public int Id { get; } = ++_count; }   // номер экземпляра по порядку создания
public sealed class ReportCache(AppDbContext db) { public AppDbContext Db { get; } = db; }
~~~
~~~console
с проверкой: Error while validating the service descriptor 'ServiceType: ReportCache Lifetime: Singleton ImplementationType: ReportCache': Cannot consume scoped service 'AppDbContext' from singleton 'ReportCache'.
запрос 1: свой контекст 2, контекст внутри синглтона 1
запрос 2: свой контекст 3, контекст внутри синглтона 1
запрос 3: свой контекст 4, контекст внутри синглтона 1
~~~

В Development контейнер включает проверку областей и падает при старте или первом разрешении сервиса: *Cannot consume scoped service 'AppDbContext' from singleton 'ReportCache'*. **Не отключай эту проверку — исправь lifetime.** Без проверки (вторая часть вывода) «ошибки нет», но синглтон навсегда держит контекст, созданный для первого обращения, — в то время как каждый запрос получает свой. В реальном приложении именно это превращается в исключения параллельности и «залипшие» данные.

Исправления: сделать `ReportCache` scoped; или, если он обязан быть синглтоном, принимать `IServiceScopeFactory` и создавать scope на каждую операцию:

~~~csharp
using Microsoft.Extensions.DependencyInjection;

var services = new ServiceCollection();
services.AddScoped<AppDbContext>();
services.AddSingleton<ReportCache>();
using var provider = services.BuildServiceProvider(new ServiceProviderOptions { ValidateScopes = true, ValidateOnBuild = true });   // проверки включены — и не падает

var cache = provider.GetRequiredService<ReportCache>();
Console.WriteLine("контекст при 1-й операции: " + cache.WhichContext());
Console.WriteLine("контекст при 2-й операции: " + cache.WhichContext());

public sealed class AppDbContext { static int _count; public int Id { get; } = ++_count; }   // номер экземпляра по порядку создания

public sealed class ReportCache(IServiceScopeFactory scopes)
{
    public int WhichContext()
    {
        using var scope = scopes.CreateScope();                       // свой scope на каждую операцию
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        return db.Id;
    }
}
~~~
~~~console
контекст при 1-й операции: 1
контекст при 2-й операции: 2
~~~

Теперь контейнер принимает конфигурацию с включёнными проверками, а контекст на каждую операцию — свой (и освобождается вместе со scope).

#### Баг 2: состояние в Singleton

~~~csharp @nocheck
builder.Services.AddSingleton<CurrentUserService>();   // ❌
public sealed class CurrentUserService { public int UserId { get; set; } }   // запрос А записал своего пользователя, запрос Б — своего...
~~~

Синглтон с изменяемым состоянием, относящимся к запросу, — гонка: пользователи видят чужие данные. Всё, что относится к запросу, — **Scoped**. Воспроизведём на настоящем сервере: два параллельных запроса от разных пользователей, обработчик записывает пользователя в сервис, «думает» 300 мс и читает обратно.

~~~csharp
var builder = WebApplication.CreateBuilder();
builder.WebHost.UseUrls("http://127.0.0.1:0");
builder.Logging.ClearProviders();
builder.Services.AddSingleton<SingletonUser>();     // ❌
builder.Services.AddScoped<ScopedUser>();           // ✅
var app = builder.Build();

app.MapGet("/who", async (HttpRequest req, SingletonUser singleton, ScopedUser scoped) =>
{
    var id = int.Parse(req.Headers["X-User"]!);
    singleton.UserId = id;
    scoped.UserId = id;
    await Task.Delay(300);                          // «работаем с базой»
    return new { запросПользователя = id, изSingleton = singleton.UserId, изScoped = scoped.UserId };
});

await app.StartAsync();
using var http = new HttpClient { BaseAddress = new Uri(app.Urls.First()) };

async Task<string> Call(int user, int startAfterMs)
{
    await Task.Delay(startAfterMs);
    using var req = new HttpRequestMessage(HttpMethod.Get, "/who");
    req.Headers.Add("X-User", user.ToString());
    return await (await http.SendAsync(req)).Content.ReadAsStringAsync();
}

var results = await Task.WhenAll(Call(user: 1, startAfterMs: 0), Call(user: 2, startAfterMs: 100));
foreach (var r in results) Console.WriteLine(r);
await app.StopAsync();

public sealed class SingletonUser { public int UserId { get; set; } }
public sealed class ScopedUser { public int UserId { get; set; } }
~~~
~~~console
{"запросПользователя":1,"изSingleton":1,"изScoped":1}
{"запросПользователя":2,"изSingleton":1,"изScoped":2}
~~~

Первый пользователь, пока «думал», получил из синглтона данные второго: `изSingleton` не совпал с `запросПользователя`. Scoped-версия у обоих верна. В реальном приложении на этом месте был бы чужой профиль или чужой заказ — серьёзный инцидент безопасности.

#### Баг 3: DbContext как Transient в сервисах одного запроса

Два сервиса в одном запросе получают **разные** контексты: изменения, сделанные через один, не видны и не сохраняются через другой, а `SaveChanges` одного не включает изменения второго — ломается единица работы. Поэтому `AddDbContext` по умолчанию регистрирует Scoped. Посмотрим, кто с кем делит экземпляр, при каждом времени жизни:

~~~csharp
using Microsoft.Extensions.DependencyInjection;

foreach (var lifetime in new[] { ServiceLifetime.Transient, ServiceLifetime.Scoped, ServiceLifetime.Singleton })
{
    var services = new ServiceCollection();
    if (lifetime == ServiceLifetime.Transient) services.AddTransient<FakeContext>();
    else if (lifetime == ServiceLifetime.Scoped) services.AddScoped<FakeContext>();
    else services.AddSingleton<FakeContext>();
    services.AddTransient<OrderService>();
    services.AddTransient<InvoiceService>();
    using var provider = services.BuildServiceProvider();

    using var request = provider.CreateScope();                          // один «запрос»
    var orders = request.ServiceProvider.GetRequiredService<OrderService>();
    var invoices = request.ServiceProvider.GetRequiredService<InvoiceService>();

    orders.Context.Pending.Add("новый заказ");                          // изменили через один сервис
    Console.WriteLine($"{lifetime,-9} общий контекст у двух сервисов: {ReferenceEquals(orders.Context, invoices.Context),-5} " +
                      $"SaveChanges в InvoiceService увидит заказ: {invoices.Context.Pending.Count > 0}");
}

public sealed class FakeContext { public List<string> Pending { get; } = new(); }
public sealed class OrderService(FakeContext ctx) { public FakeContext Context { get; } = ctx; }
public sealed class InvoiceService(FakeContext ctx) { public FakeContext Context { get; } = ctx; }
~~~
~~~console
Transient общий контекст у двух сервисов: False SaveChanges в InvoiceService увидит заказ: False
Scoped    общий контекст у двух сервисов: True  SaveChanges в InvoiceService увидит заказ: True
Singleton общий контекст у двух сервисов: True  SaveChanges в InvoiceService увидит заказ: True
~~~

Только **Scoped** даёт то, что нужно: общий контекст на запрос (а значит, единая транзакция), но не общий между запросами. Transient разваливает единицу работы, Singleton делает её общей для всех пользователей.

:::key Формула для собеседования
«Зависимость не должна жить меньше, чем тот, кто её держит. Singleton не может зависеть от Scoped или Transient-со-состоянием: он их “захватит” навсегда. У меня был баг: [описание из твоего проекта]. Исправил так: [...]».
:::

### Шаг 5. Освобождение ресурсов

Контейнер отвечает не только за создание, но и за `Dispose` объектов, которые он **создал сам** (реализующих `IDisposable`/`IAsyncDisposable`): scoped и transient — когда закрывается scope; singleton — когда закрывается весь контейнер. Объекты, которые ты сам создал и передал готовыми (`AddSingleton(new Thing())`), контейнер не освобождает.

~~~csharp
using Microsoft.Extensions.DependencyInjection;

var services = new ServiceCollection();
services.AddTransient<TransientProbe>();
services.AddScoped<ScopedProbe>();
services.AddSingleton<SingletonProbe>();
var provider = services.BuildServiceProvider();

Console.WriteLine("-- открыли scope (запрос)");
using (var scope = provider.CreateScope())
{
    scope.ServiceProvider.GetRequiredService<ScopedProbe>();
    scope.ServiceProvider.GetRequiredService<TransientProbe>();
    scope.ServiceProvider.GetRequiredService<SingletonProbe>();
    Console.WriteLine("-- закрываем scope");
}
Console.WriteLine("-- scope закрыт, закрываем контейнер (завершение приложения)");
provider.Dispose();

public abstract class Probe : IDisposable
{
    protected Probe() => Console.WriteLine($"   создан  {GetType().Name}");
    public void Dispose() => Console.WriteLine($"   Dispose {GetType().Name}");
}
public sealed class TransientProbe : Probe;
public sealed class ScopedProbe : Probe;
public sealed class SingletonProbe : Probe;
~~~
~~~console
-- открыли scope (запрос)
   создан  ScopedProbe
   создан  TransientProbe
   создан  SingletonProbe
-- закрываем scope
   Dispose TransientProbe
   Dispose ScopedProbe
-- scope закрыт, закрываем контейнер (завершение приложения)
   Dispose SingletonProbe
~~~

Отсюда практические выводы. Scoped и transient освобождаются вместе с запросом — удобно. Singleton живёт до остановки приложения. А transient-объект, который реализует `IDisposable` и получен **из корневого контейнера** (например, внутри singleton), не освободится до конца работы приложения — медленная утечка.

### Шаг 6. Несколько реализаций и именованные регистрации

Один интерфейс можно зарегистрировать несколько раз. Запрос одного экземпляра вернёт **последнюю** регистрацию, а `IEnumerable<T>` — все по порядку. С .NET 8 есть именованные (keyed) сервисы — если нужно выбирать реализацию явно.

~~~csharp
using Microsoft.Extensions.DependencyInjection;

var services = new ServiceCollection();
services.AddSingleton<IGreeter, RuGreeter>();
services.AddSingleton<IGreeter, EnGreeter>();                 // последняя регистрация «побеждает» при запросе одного
services.AddKeyedSingleton<IGreeter, RuGreeter>("ru");
services.AddKeyedSingleton<IGreeter, EnGreeter>("en");
using var provider = services.BuildServiceProvider();

Console.WriteLine("один:     " + provider.GetRequiredService<IGreeter>().Hello());
Console.WriteLine("все:      " + string.Join(" | ", provider.GetServices<IGreeter>().Select(g => g.Hello())));
Console.WriteLine("по ключу: " + provider.GetRequiredKeyedService<IGreeter>("ru").Hello());

public interface IGreeter { string Hello(); }
public sealed class RuGreeter : IGreeter { public string Hello() => "Привет"; }
public sealed class EnGreeter : IGreeter { public string Hello() => "Hello"; }
~~~
~~~console
один:     Hello
все:      Привет | Hello
по ключу: Привет
~~~

### Шаг 7. Ошибки конфигурации контейнера

Самая частая — незарегистрированная зависимость: контейнер не знает, как создать тип, и бросает понятное исключение при первом запросе сервиса. Чуть менее частая — циклическая зависимость (A требует B, B требует A): контейнер обнаруживает её и сообщает цепочку.

~~~csharp
using Microsoft.Extensions.DependencyInjection;

var services = new ServiceCollection();
services.AddTransient<OrderService>();                       // зависит от IMailer, который НЕ зарегистрирован
services.AddTransient<A>();
services.AddTransient<B>();
using var provider = services.BuildServiceProvider();

try { provider.GetRequiredService<OrderService>(); }
catch (InvalidOperationException ex) { Console.WriteLine(ex.Message); }

try { provider.GetRequiredService<A>(); }
catch (InvalidOperationException ex) { Console.WriteLine(ex.Message.Replace("\n", " | ")); }

public interface IMailer;
public sealed class OrderService(IMailer mailer) { public IMailer Mailer { get; } = mailer; }
public sealed class A(B b) { public B B { get; } = b; }
public sealed class B(A a) { public A A { get; } = a; }
~~~
~~~console
Unable to resolve service for type 'IMailer' while attempting to activate 'OrderService'.
A circular dependency was detected for the service of type 'A'. | A -> B -> A
~~~

Циклическая зависимость почти всегда означает, что две ответственности нужно разделить или вынести общее в третий класс (см. принципы [SOLID](#p2-solid)).

## Как это работает под капотом

- **Контейнер — это таблица дескрипторов.** `ServiceCollection` — список записей «тип сервиса → реализация/фабрика → lifetime». `BuildServiceProvider` превращает список в провайдер, который по типу находит дескриптор и строит *цепочку вызова* (call site): создать зависимости рекурсивно, затем сам объект. Цепочка анализируется один раз и кэшируется, дальнейшие разрешения работают быстро.
- **Корневой провайдер и scope.** Есть один корневой провайдер (на всё приложение) и дочерние scope. Singleton-экземпляры живут в корне; scoped — в конкретном scope; transient не кэшируются. ASP.NET Core на каждый HTTP-запрос создаёт scope, и `HttpContext.RequestServices` — это провайдер этого scope; после ответа scope закрывается и освобождает scoped и transient объекты, созданные в нём.
- **Откуда берётся «захват».** Singleton создаётся из корневого провайдера, значит, и его зависимости разрешаются из корня: scoped-сервис, запрошенный из корня, становится фактически singleton (он живёт столько же, сколько корневой провайдер). Именно это ловит проверка `ValidateScopes` — и поэтому она включена по умолчанию лишь в `Development` (где ты разрабатываешь) и не включена в Production (где она бы стоила накладных расходов).
- **`ValidateOnBuild`.** Дополнительно проверяет при сборке контейнера, что для всех зарегистрированных сервисов можно построить зависимости (нет «дыр» в регистрации); полезно в тестах.
- **Выбор конструктора.** Если у типа несколько конструкторов, контейнер выбирает тот, аргументы которого может разрешить, предпочитая «самый длинный»; при неоднозначности бросает исключение.
- **Service locator.** Вызов `provider.GetService<T>()` внутри бизнес-кода скрывает зависимости (по конструктору их не видно) и затрудняет тесты. Допустим только в «инфраструктурных» местах (фабрики, фоновые задачи с `IServiceScopeFactory`).
- **Фоновые службы и `IServiceScopeFactory`.** `BackgroundService` — singleton; чтобы использовать `DbContext`, внутри каждой итерации открывают scope через `IServiceScopeFactory` (как в примере выше) либо используют `IDbContextFactory<T>`.
- **Многопоточность.** Singleton вызывается параллельно из многих запросов, поэтому его состояние должно быть неизменяемым или потокобезопасным; Scoped обычно живёт в одном потоке запроса, но `DbContext` всё равно не потокобезопасен.
- **Почему DI вообще нужен тестам.** Конструкторная инъекция позволяет подставить заглушку вместо настоящей зависимости (например, `IClock` с фиксированным временем) без запуска всего приложения.

## Типичные ошибки и ловушки

- **Singleton зависит от Scoped.** Captive dependency: захват `DbContext` на всё время жизни приложения.
- **Состояние запроса в Singleton.** Данные пользователей смешиваются.
- **Transient `DbContext`** или `AddTransient<DbContext>` вручную: нет единой единицы работы.
- **Ручное создание сервисов через `new` в обход контейнера.** Зависимости не подставляются, lifetime теряется, тестировать трудно.
- **`GetService` повсюду (service locator).** Зависимости скрыты от читателя.
- **Отключённая проверка областей «чтобы заработало».** Ошибка остаётся, просто молчит.
- **Забытая регистрация.** Исключение «Unable to resolve service for type …» при первом обращении, а не при старте (используй `ValidateOnBuild` в тестах).
- **Transient с `IDisposable` из корневого провайдера.** Копятся неосвобождённые объекты.
- **Циклические зависимости.** Признак слишком связанных классов.
- **`HttpClient` через `new` в каждом запросе.** Исчерпание сокетов; используй `IHttpClientFactory`/типизированные клиенты.
- **Конструктор с 8+ зависимостями.** Класс делает слишком много — разделить ответственность.

## Вопросы с собеседований

:::spoiler Почему DbContext регистрируют как Scoped?
Он не потокобезопасен и является единицей работы. Один контекст на HTTP-запрос: все сервисы запроса работают с одним набором отслеживаемых изменений и одной транзакцией `SaveChanges`, а между запросами контексты не пересекаются.
:::

:::spoiler Что такое captive dependency?
Когда долгоживущий сервис (Singleton) получает зависимость с более коротким временем жизни (Scoped/Transient) и удерживает её дольше задуманного — фактически превращая в синглтон.
:::

:::spoiler Как правильно использовать DbContext в синглтоне или фоновой задаче?
Через `IServiceScopeFactory`: создать scope на единицу работы, взять из него контекст и освободить scope после операции. (Или `IDbContextFactory<T>`.)
:::

:::spoiler Чем Transient, Scoped и Singleton отличаются? (ловушка: «Singleton просто быстрее»)
Transient — новый экземпляр при каждом запросе зависимости; Scoped — один на scope (HTTP-запрос); Singleton — один на приложение. Выбор — не про скорость, а про то, чьё состояние хранит объект и кто его разделяет.
:::

:::spoiler Кто освобождает (Dispose) объекты, созданные контейнером?
Контейнер: scoped и transient — при закрытии scope, singleton — при закрытии контейнера. Объекты, которые ты создал сам и передал готовыми, контейнер не освобождает.
:::

:::spoiler Что делает `ValidateScopes` и почему он включён только в Development?
Проверяет, что scoped-сервисы не разрешаются из корневого провайдера и не внедряются в singleton. Он добавляет накладные расходы, поэтому по умолчанию включён лишь при разработке — ошибки находят до продакшена.
:::

:::spoiler Что вернёт `GetRequiredService<IGreeter>()`, если зарегистрировано две реализации?
Последнюю зарегистрированную. Все реализации — через `IEnumerable<IGreeter>` / `GetServices<IGreeter>()`, конкретную — через keyed-регистрацию.
:::

:::spoiler Почему конструкторная инъекция лучше service locator?
Зависимости видны в сигнатуре конструктора, класс легко протестировать с заглушками, а контейнер проверяет полноту регистрации заранее.
:::

## Что запомнить

- DI-контейнер создаёт объекты и подставляет зависимости через конструкторы; ты регистрируешь типы и время жизни.
- Transient — новый всегда; Scoped — один на HTTP-запрос; Singleton — один на приложение.
- Зависимость не должна жить меньше, чем тот, кто её держит: Singleton не берёт Scoped напрямую.
- `DbContext` — Scoped; для singleton и фоновых задач — `IServiceScopeFactory` или `IDbContextFactory`.
- Состояние запроса — только в Scoped; Singleton должен быть неизменяемым или потокобезопасным.
- Включённая проверка областей в Development — твой друг: не отключай, а исправляй регистрации.
- Scoped и transient освобождаются вместе со scope, singleton — вместе с приложением.

## Практика

- [ ] Запустил эксперимент `/ids` и записал, что совпадает и почему
- [ ] **Воспроизвёл Баг 1** в своём проекте, прочитал сообщение контейнера, исправил двумя способами
- [ ] Воспроизвёл Баг 2 двумя одновременными запросами (два окна curl) — увидел чужие данные
- [ ] Записал в заметки «мой баг с lifetime»: что сломалось, как заметил, как исправил — это ответ для критерия

