@@page id="p6-compose" phase="6" kind="topic" title="Docker Compose: весь стек одной командой" nav="Docker Compose: весь стек" est="~1 неделя"
:::why
В Фазе 4 ты уже запускал API и базу в Docker. Теперь — «не только уметь, а деплоить свой стек»: добавить кэш, проверки здоровья, разделить настройки для разработки и продакшена. Тот же `compose.yaml` станет основой деплоя на VPS.
:::

## Зачем это нужно

Реальное приложение — это не один процесс, а набор: API, база данных, кэш, иногда очередь и обратный прокси. Запускать их руками (`docker run` с десятком флагов для каждого) долго и ненадёжно: забудешь сеть, том, переменную. **Docker Compose** описывает весь стек одним файлом `compose.yaml` и поднимает его командой `docker compose up`. Тот же файл работает на твоём ноутбуке, у коллеги и на сервере, а значит «у меня работает» превращается в «работает одинаково».

Что ты получишь от темы:

- научишься описывать связанные сервисы, сеть, тома и переменные одним файлом;
- поймёшь, чем «контейнер запущен» отличается от «сервис готов», и как это выражают проверки здоровья ([health checks](#p4-hosting));
- разделишь настройки разработки и сервера, не копируя файл;
- безопасно обойдёшься с секретами (`.env`, а не репозиторий);
- сделаешь резервную копию базы и, главное, **проверишь, что из неё можно восстановиться**.

Честная оговорка: Docker-демона в нашей учебной среде нет, поэтому `docker compose up` здесь не запускался. Всё, что можно проверить без него, проверено на месте: файл разобран парсером YAML и проверен небольшим линтером, проверки здоровья ASP.NET Core запущены на настоящем сервере, привязка переменных окружения к конфигурации воспроизведена, а резервная копия PostgreSQL сделана настоящим `pg_dump` и восстановлена в новую базу. Поведение самого Compose описано по документации.

## Интуиция и аналогия

**Compose — это план рассадки в ресторане.** Без плана каждый гость (контейнер) ищет место и соседей сам. С планом администратор знает, кто за каким столиком, кого посадить первым (база), а кого после (API, который без базы бесполезен), и кто имеет право входить с улицы (опубликованные порты).

**Healthcheck — это пульс, а не «человек пришёл».** Контейнер «запущен» — человек вошёл в зал. Сервис «здоров» — он действительно отвечает на запросы. База данных может стартовать десять секунд после запуска процесса; если API придёт раньше, он упадёт при первом подключении.

**`.env` и секреты — ключи от сейфа.** Схема сейфа можно показывать всем (файл `compose.yaml` в репозитории), а ключи нет (`.env` в `.gitignore`).

**Том — это внешний диск.** Контейнер можно выбросить и пересоздать, а данные на «внешнем диске» (том) остаются. Удалил том — удалил базу.

## Основная теория по шагам

### Шаг 1. Стек капстоуна

~~~yaml compose.yaml
services:
  api:
    build: .
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_healthy
    environment:
      ASPNETCORE_ENVIRONMENT: ${APP_ENV:-Development}
      ConnectionStrings__Default: "Host=db;Port=5432;Database=app;Username=app;Password=${DB_PASSWORD:?нужен DB_PASSWORD в .env}"
      ConnectionStrings__Redis: "redis:6379"
      Jwt__Key: ${JWT_KEY:?нужен JWT_KEY в .env}
    ports:
      - "8080:8080"
    healthcheck:
      test: ["CMD-SHELL", "curl -fs http://localhost:8080/health || exit 1"]
      interval: 15s
      timeout: 3s
      retries: 3
    restart: unless-stopped

  db:
    image: postgres:16
    environment:
      POSTGRES_USER: app
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      POSTGRES_DB: app
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U app -d app"]
      interval: 5s
      timeout: 3s
      retries: 10
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 10
    restart: unless-stopped

volumes:
  pgdata:
~~~

~~~text .env (в .gitignore!)
DB_PASSWORD=длинный-случайный-пароль
JWT_KEY=длинный-случайный-ключ-не-короче-32-байт
APP_ENV=Development
~~~

Разбор по частям:

- `${VAR:-значение}` подставляет значение по умолчанию, если переменная не задана; `${VAR:?сообщение}` останавливает запуск с сообщением: забытый секрет виден сразу, а не в виде таинственной ошибки соединения через минуту. Compose читает `.env` из каталога проекта автоматически.
- `depends_on` с `condition: service_healthy` заставляет Compose ждать, пока проверка здоровья зависимости не станет успешной. Без `condition` Compose ждёт только запуска контейнера, а не готовности.
- `restart: unless-stopped` поднимет контейнер после падения или перезагрузки сервера, если ты не останавливал его сам.
- База и Redis **не публикуют порты** наружу: API ходит к ним по внутренней сети Compose по именам сервисов (`Host=db`, `redis:6379`). Имя сервиса — это DNS-имя внутри сети. Для отладки с локальной машины открывай порты в файле для разработки.
- Строка подключения в стиле `ConnectionStrings__Default` — это переменная окружения, вложенный ключ конфигурации ASP.NET Core записывается через двойное подчёркивание (проверим ниже).
- Проверка здоровья API через `curl` требует, чтобы `curl` был в образе. В официальных образах `aspnet` его может не быть: тогда установи его в Dockerfile или проверяй здоровье снаружи (мониторингом), либо используй другой способ проверки.
- Старое поле `version:` в начале файла больше не нужно: современный Compose его игнорирует.

### Шаг 2. Проверяем файл линтером

Пока нельзя запустить Compose, можно хотя бы убедиться, что файл согласован внутри себя. Простейший линтер на Python разбирает YAML и проверяет типичные ошибки: зависимость от несуществующего сервиса, ожидание здоровья у сервиса без `healthcheck`, отсутствующая политика перезапуска, опубликованный порт базы в основном файле, переменные, не описанные в `.env`:

~~~python @nocheck
import re, yaml

def load(path): return yaml.safe_load(open(path, encoding="utf-8"))

main, override = load("compose.yaml"), load("compose.override.yaml")
services = main["services"]
problems = []
for name, svc in services.items():
    for dep, cond in (svc.get("depends_on") or {}).items():
        if dep not in services:
            problems.append(f"{name}: depends_on указывает на несуществующий сервис {dep}")
        elif cond.get("condition") == "service_healthy" and "healthcheck" not in services[dep]:
            problems.append(f"{name}: ждёт здоровья {dep}, но у {dep} нет healthcheck")
    if "restart" not in svc:
        problems.append(f"{name}: нет restart-политики")
    if name in ("db", "redis") and "ports" in svc:
        problems.append(f"{name}: порт опубликован в основном файле")

used = set(re.findall(r"\$\{(\w+)", open("compose.yaml", encoding="utf-8").read()))
defined = {line.split("=")[0] for line in open(".env", encoding="utf-8") if "=" in line}
print("сервисов:", ", ".join(services), "| томов:", ", ".join(main["volumes"]))
print("переменные из compose.yaml:", ", ".join(sorted(used)))
print("не заданы в .env:", ", ".join(sorted(used - defined)) or "нет")
print("замечаний:", len(problems))
for p in problems: print(" -", p)
~~~

Запуск на файле из этой страницы вернул (запускали по-настоящему):

~~~console
сервисов: api, db, redis | томов: pgdata
переменные из compose.yaml: APP_ENV, DB_PASSWORD, JWT_KEY
не заданы в .env: нет
замечаний: 0
~~~

Если убрать из файла проверки здоровья (в нашем опыте переименовали ключ `healthcheck`), линтер сообщает: `api: ждёт здоровья db, но у db нет healthcheck` и то же для `redis`. Это не замена настоящей команде `docker compose config` (она выводит итоговый файл с подставленными переменными и проверяет схему): запусти её на своей машине.

### Шаг 3. Health checks в приложении

~~~csharp @nocheck
builder.Services.AddHealthChecks();
// + проверка базы (пакет Microsoft.Extensions.Diagnostics.HealthChecks.EntityFrameworkCore):
// builder.Services.AddHealthChecks().AddDbContextCheck<AppDbContext>();

var app = builder.Build();
app.MapHealthChecks("/health");          // 200 Healthy / 503 Unhealthy
~~~

Эндпоинт `/health` используют Docker, облачные платформы и внешний мониторинг, чтобы понять, живо ли приложение. Но один «общий» эндпоинт — слабое место: если база временно недоступна, оркестратор перезапустит **здоровый** процесс, и это не поможет. Различай два вопроса: «процесс жив?» (liveness) и «можно слать трафик?» (readiness). Запустим настоящий сервер с тремя эндпоинтами и проверками разного состояния:

~~~csharp
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Microsoft.Extensions.Diagnostics.HealthChecks;

var state = new DepState();
var builder = WebApplication.CreateBuilder();
builder.WebHost.UseUrls("http://127.0.0.1:0");
builder.Logging.ClearProviders();
builder.Services.AddSingleton(state);
builder.Services.AddHealthChecks()
    .AddCheck<DatabaseCheck>("db", tags: ["ready"])
    .AddCheck<CacheCheck>("cache", tags: ["ready"]);
var app = builder.Build();

app.MapHealthChecks("/health/live", new HealthCheckOptions { Predicate = _ => false });                     // процесс отвечает — этого достаточно
app.MapHealthChecks("/health/ready", new HealthCheckOptions { Predicate = c => c.Tags.Contains("ready") });  // зависимости
app.MapHealthChecks("/health", new HealthCheckOptions
{
    ResponseWriter = async (ctx, report) =>
    {
        ctx.Response.ContentType = "text/plain; charset=utf-8";
        await ctx.Response.WriteAsync(string.Join(", ", report.Entries.OrderBy(e => e.Key).Select(e => $"{e.Key}={e.Value.Status}")));
    }
});

await app.StartAsync();
using var http = new HttpClient { BaseAddress = new Uri(app.Urls.First()) };

async Task Show(string title)
{
    Console.WriteLine(title);
    foreach (var url in new[] { "/health/live", "/health/ready", "/health" })
    {
        var r = await http.GetAsync(url);
        Console.WriteLine($"  GET {url,-13} → {(int)r.StatusCode} {await r.Content.ReadAsStringAsync()}");
    }
}

await Show("все зависимости в порядке:");
state.CacheUp = false;
await Show("кэш недоступен (приложение работает без него медленнее → Degraded):");
state.DbUp = false;
await Show("база недоступна:");

await app.StopAsync();

public sealed class DepState { public bool DbUp = true; public bool CacheUp = true; }

public sealed class DatabaseCheck(DepState s) : IHealthCheck
{
    public Task<HealthCheckResult> CheckHealthAsync(HealthCheckContext context, CancellationToken ct = default) =>
        Task.FromResult(s.DbUp ? HealthCheckResult.Healthy() : HealthCheckResult.Unhealthy("нет соединения"));
}

public sealed class CacheCheck(DepState s) : IHealthCheck
{
    public Task<HealthCheckResult> CheckHealthAsync(HealthCheckContext context, CancellationToken ct = default) =>
        Task.FromResult(s.CacheUp ? HealthCheckResult.Healthy() : HealthCheckResult.Degraded("работаем без кэша"));
}
~~~
~~~console
все зависимости в порядке:
  GET /health/live  → 200 Healthy
  GET /health/ready → 200 Healthy
  GET /health       → 200 cache=Healthy, db=Healthy
кэш недоступен (приложение работает без него медленнее → Degraded):
  GET /health/live  → 200 Healthy
  GET /health/ready → 200 Degraded
  GET /health       → 200 cache=Degraded, db=Healthy
база недоступна:
  GET /health/live  → 200 Healthy
  GET /health/ready → 503 Unhealthy
  GET /health       → 503 cache=Degraded, db=Unhealthy
~~~

Заметь три вещи. `liveness` отвечает `200` всегда, пока жив процесс, поэтому перезапускать контейнер по нему имеет смысл только при зависании. `readiness` становится `503` при **недоступной базе** и остаётся `200` при деградации кэша (`Degraded` по умолчанию даёт `200`; если хочешь иначе, настрой `ResultStatusCodes`). И по умолчанию тело ответа это просто слово `Healthy`/`Degraded`/`Unhealthy`; подробный разбор по зависимостям мы вывели своим `ResponseWriter`. Не показывай внешним пользователям подробности: имена зависимостей и тексты ошибок помогают атакующему.

### Шаг 4. Переменные окружения становятся конфигурацией

Двойное подчёркивание в `ConnectionStrings__Default` не опечатка. Проверим, что приложение действительно так читает конфигурацию (это тот же механизм, что в [конфигурации](#p4-hosting)):

~~~csharp
Environment.SetEnvironmentVariable("ConnectionStrings__Default", "Host=db;Port=5432;Database=app;Username=app;Password=секрет");
Environment.SetEnvironmentVariable("ConnectionStrings__Redis", "redis:6379");
Environment.SetEnvironmentVariable("Jwt__Key", "ключ-из-compose");
Environment.SetEnvironmentVariable("ASPNETCORE_ENVIRONMENT", "Production");

var builder = WebApplication.CreateBuilder();
var cfg = builder.Configuration;

Console.WriteLine($"окружение: {builder.Environment.EnvironmentName}");
Console.WriteLine($"ConnectionStrings:Default через GetConnectionString: {cfg.GetConnectionString("Default")}");
Console.WriteLine($"ConnectionStrings:Redis: {cfg["ConnectionStrings:Redis"]}");
Console.WriteLine($"Jwt:Key: {cfg["Jwt:Key"]}");
Console.WriteLine($"секция Jwt содержит ключей: {cfg.GetSection("Jwt").GetChildren().Count()}");

// забытая переменная: приложение должно упасть сразу и понятно, а не при первом запросе
try
{
    var missing = cfg["Jwt:Issuer"] ?? throw new InvalidOperationException("не задан Jwt__Issuer");
}
catch (InvalidOperationException e)
{
    Console.WriteLine($"приложение не стартует: {e.Message}");      // в реальном Program.cs исключение не ловят: процесс завершится с ошибкой
}
~~~
~~~console
окружение: Production
ConnectionStrings:Default через GetConnectionString: Host=db;Port=5432;Database=app;Username=app;Password=секрет
ConnectionStrings:Redis: redis:6379
Jwt:Key: ключ-из-compose
секция Jwt содержит ключей: 1
приложение не стартует: не задан Jwt__Issuer
~~~

Проверка в конце нарочно «падает»: так выглядит быстрый отказ при забытой настройке (в настоящем приложении исключение не перехватывают, процесс завершается с ошибкой). Compose-конструкция `${VAR:?…}` делает то же на уровень раньше, до запуска контейнера.

### Шаг 5. Разработка и продакшен — разные файлы

~~~yaml compose.override.yaml (подхватывается автоматически, только для разработки)
services:
  db:
    ports:
      - "5432:5432"        # подключаться к базе из DBeaver
  redis:
    ports:
      - "6379:6379"
~~~

~~~bash
docker compose up --build -d                                   # разработка: compose.yaml + compose.override.yaml
docker compose -f compose.yaml up -d                           # сервер: только основной файл, без открытых портов БД
docker compose logs -f api                                     # логи
docker compose exec db psql -U app -d app                      # консоль базы
docker compose config                                          # итоговый файл с подставленными переменными (проверка)
docker compose down                                            # остановить и удалить контейнеры (тома остаются)
~~~

Правило: `compose.yaml` описывает то, что одинаково везде, а `compose.override.yaml` содержит только отличия разработки. Файл с вариантами для сервера можно держать отдельно (`compose.prod.yaml`) и указывать явно через `-f`.

### Шаг 6. Резервная копия и восстановление

Копия, из которой ни разу не восстанавливались, это гипотеза. Проверим на настоящем PostgreSQL, делая то же, что делает `docker compose exec db pg_dump`: создадим базу с 1000 строк, снимем копию, восстановим её в новую базу, удалим 10 строк в рабочей и убедимся, что в копии они остались:

~~~bash
pg_dump -U postgres -d app > backup.sql                 # логическая копия: SQL-скрипт
psql -U postgres -d app_restored < backup.sql           # восстановление в пустую базу
~~~

Результат (выполнено настоящими `pg_dump` и `psql` на PostgreSQL 16):

~~~console
в восстановленной базе: 1000 строк
в рабочей базе после удаления 10 строк: 990
в восстановленной базе строк, удалённых из рабочей: 10
~~~

В Compose команда выглядит так: `docker compose exec -T db pg_dump -U app app > backup.sql` (флаг `-T` отключает псевдотерминал, иначе перенаправление может испортить файл), а восстановление: `docker compose exec -T db psql -U app -d app < backup.sql`. По расписанию (cron на сервере) копию делают минимум раз в сутки, хранят **вне** сервера, а раз в какое-то время проверяют восстановление на чистом томе. Это пункт практики.

:::tip Резервные копии
Данные живут в томе `pgdata`. Простая страховка для капстоуна: `pg_dump` по расписанию. Удалить том (`docker compose down -v`) значит удалить базу.
:::

## Как это работает под капотом

- **Сеть Compose.** Для проекта создаётся отдельная сеть, и контейнеры видят друг друга по имени сервиса (встроенный DNS Docker). Опубликованный порт `"8080:8080"` пробрасывает порт хоста в контейнер, а внутри сети публиковать ничего не нужно.
- **Том.** Каталог данных, которым управляет Docker и который живёт вне файловой системы контейнера. Удаление контейнера тома не касается; удаление проекта с `-v` удаляет.
- **Healthcheck.** Docker периодически запускает команду внутри контейнера и по коду выхода (0 здоров, 1 нет) обновляет статус `healthy`/`unhealthy`; `retries` последовательных неудач переводят в `unhealthy`. Сам по себе `unhealthy` контейнер Docker не перезапускает (перезапуск делает политика `restart` только при падении процесса); перезапускать по здоровью умеют оркестраторы вроде Kubernetes.
- **Порядок запуска.** `depends_on` управляет **порядком**, но готовность приложения всё равно нужно проверять: база может «моргнуть» позже. Приложение обязано переживать кратковременные ошибки соединения (повторные попытки), как в [устойчивости](#p6-cache).
- **Интерполяция.** Подстановка `${...}` выполняется самим Compose до запуска контейнеров, из переменных окружения оболочки и файла `.env`. Поэтому `docker compose config` показывает уже подставленные значения (**с секретами в открытом виде**: не вставляй его вывод в чаты и тикеты).
- **Наложение файлов.** Несколько файлов `-f` объединяются: скалярные значения перезаписываются, списки портов складываются. `compose.override.yaml` подхватывается автоматически, если не указать `-f` явно.
- **Логическая копия.** `pg_dump` читает базу в согласованном снимке и записывает команды SQL, которыми её можно воссоздать (мы видели, что в копии есть `CREATE TABLE`). Это переносимо между версиями, но на больших базах медленно; для них используют физические копии и архив журнала.
- **Что скрывает образ.** Контейнер запускается от пользователя образа; в образах .NET пользователь без прав `root` (задаётся `USER $APP_UID`, см. [Docker](#p4-docker)). Права на тома и порты ниже 1024 зависят от этого.

## Типичные ошибки и ловушки

- **Секреты в репозитории.** `.env` не в `.gitignore`, пароль в `compose.yaml` напрямую. Положи в репозиторий `.env.example` с пустыми значениями.
- **Порт базы опубликован в интернет.** Постоянный подбор паролей. Публикуй только `80`/`443` (и SSH для управления), а базу оставь во внутренней сети.
- **`depends_on` без `condition: service_healthy`.** API стартует раньше готовой базы и падает.
- **Проверка здоровья через `curl`, а его в образе нет.** Контейнер вечно `unhealthy` (или проверка вообще не работает). Убедись, что нужная команда есть в образе.
- **Один эндпоинт `/health` для всего.** Падение базы приводит к перезапуску здорового процесса. Раздели liveness и readiness.
- **Бекап без проверки восстановления.** Файл есть, а восстановить нельзя (повреждён, версия, права).
- **Бекап лежит на том же сервере.** Диск умер вместе с базой и копией. Храни копии отдельно.
- **`docker compose down -v` «для чистоты».** Флаг `-v` удаляет тома, то есть базу.
- **Тег `latest` или плавающий мажор образа (`postgres:16` обновится при пересоздании).** Фиксируй версию осознанно и обновляй по плану; для баз смена мажорной версии требует миграции данных.
- **Строка подключения с `localhost` внутри контейнера.** `localhost` в контейнере это он сам, а не соседний сервис. Используй имя сервиса (`db`).
- **Разные `compose` для разработки и сервера, которые разъехались.** Держи общее в основном файле, отличия в override.
- **Забытая `restart`-политика.** После перезагрузки VPS ничего не поднимется.
- **Вывод `docker compose config` с секретами в открытом виде скопирован в чат.**

## Вопросы с собеседований

:::spoiler Зачем нужен Docker Compose, если есть Docker?
Compose описывает несколько связанных контейнеров, сети, тома и переменные одним декларативным файлом и поднимает их одной командой. Это воспроизводимо и избавляет от длинных `docker run` для каждого сервиса.
:::

:::spoiler Почему база в продакшене не публикует порт наружу?
Ей нужен доступ только от API внутри сети compose. Открытый порт PostgreSQL в интернет — постоянные попытки подбора пароля и лишняя поверхность атаки.
:::

:::spoiler Что даёт condition: service_healthy в depends_on?
API стартует только после того, как проверка здоровья базы (и Redis) прошла, а не просто после запуска контейнера. Иначе приложение может упасть на первом подключении к ещё не готовой базе.
:::

:::spoiler Чем liveness отличается от readiness? (ловушка: «одно и то же»)
Liveness отвечает, жив ли процесс (перезапуск при зависании). Readiness — можно ли слать трафик (зависимости доступны). Если смешать, недоступная база приведёт к бессмысленным перезапускам здорового процесса.
:::

:::spoiler Как передать секреты контейнеру и не закоммитить их?
Через `.env` (в `.gitignore`) и подстановку `${VAR}` в compose или через механизм секретов оркестратора. В репозитории хранить `.env.example` без значений.
:::

:::spoiler Что произойдёт с данными базы при `docker compose down`? А при `down -v`? (ловушка)
При `down` контейнеры и сеть удаляются, том остаётся — данные сохранятся. При `down -v` тома удаляются вместе с данными.
:::

:::spoiler Как сделать резервную копию PostgreSQL в Compose и убедиться, что она годится?
`docker compose exec -T db pg_dump -U app app > backup.sql` по расписанию, хранение вне сервера и периодическое восстановление в чистую базу с проверкой количества строк.
:::

:::spoiler Почему внутри контейнера `localhost` не указывает на базу?
У каждого контейнера свой сетевой стек, `localhost` это он сам. Соседние сервисы доступны по имени сервиса через DNS сети Compose.
:::

:::spoiler Что означает `ConnectionStrings__Default` в переменных окружения?
Вложенный ключ конфигурации `ConnectionStrings:Default`: двойное подчёркивание заменяет двоеточие, так как оно недопустимо в именах переменных окружения на некоторых платформах.
:::

## Что запомнить

- Compose описывает стек (сервисы, сети, тома, переменные) одним файлом и запускается одной командой.
- `depends_on` + `condition: service_healthy` ждёт готовности, а не просто запуска.
- База и Redis не публикуют порты в продакшене; сервисы общаются по именам во внутренней сети.
- Секреты в `.env` вне репозитория; `${VAR:?…}` останавливает запуск при забытой переменной.
- Различай liveness и readiness; подробности проверок не показывай наружу.
- `compose.yaml` общий, `compose.override.yaml` только для разработки; итог видно через `docker compose config`.
- Том хранит данные: `down -v` удаляет базу. Резервная копия имеет смысл только если восстановление проверено.
- Здесь проверены YAML, health checks, привязка конфигурации и `pg_dump`/restore; сам `docker compose up` проверь на своей машине.

## Практика

- [ ] Собрал `compose.yaml` капстоуна с API, PostgreSQL и Redis, секреты — в `.env`
- [ ] Добавил `/health` и проверку здоровья API
- [ ] Разделил настройки разработки (`compose.override.yaml`) и сервера
- [ ] Сделал резервную копию базы и восстановил её в новый том

@@page id="p6-deploy" phase="6" kind="topic" title="Деплой: облако или VPS, HTTPS, миграции, мониторинг" nav="Деплой" est="~1 неделя"
:::why
Критерий фазы: капстоун **доступен по публичной ссылке дольше недели без падений**. Ссылка в резюме, которая открывается, весит больше любого описания. Деплой — это ещё и проверка, что проект не зависит от твоего ноутбука.
:::

## Зачем это нужно

Пока приложение работает только на твоём компьютере, оно «не существует» для рекрутера: он не будет клонировать репозиторий и ставить SDK. Публичная ссылка решает три задачи сразу: показывает результат, доказывает, что проект переносим (нет жёстких путей, секретов в коде, локальной базы), и даёт тебе опыт, о котором спрашивают на собеседовании: «как ты выкладывал своё приложение, что делал при падении, как применял миграции».

Деплой вскрывает класс ошибок, невидимых локально:

- приложение за обратным прокси считает, что работает по `http`, и строит неверные ссылки;
- два экземпляра одновременно применяют миграции и ломают базу;
- секрет остался в образе, а в логах нет ни строки;
- сервис «упал в пятницу вечером», а ты узнал об этом в понедельник от рекрутера.

Что ты получишь: выберешь платформу осознанно, настроишь HTTPS, безопасно применишь миграции, настроишь мониторинг и уложишь всё в чек-лист. Честно о границах: ни облачная платформа, ни VPS, ни Caddy в нашей среде недоступны (нужны аккаунт, домен и сервер), поэтому здесь они описаны по документации. Запущены же на месте и проверены три вещи, на которых чаще всего ломаются деплои: **заголовки обратного прокси** на настоящем сервере ASP.NET Core, **гонка миграций** на настоящем PostgreSQL и **логика мониторинга** (когда считать сервис упавшим).

## Интуиция и аналогия

**Деплой — это переезд в новую квартиру.** Дома ты не замечал, что дверь открывается ногой, а свет включается особым образом (локальные «костыли»). На новом месте остаются только вещи, которые ты явно упаковал: код, образ, конфигурация. Всё остальное придётся объяснить новому жильцу, то есть серверу.

**Обратный прокси — консьерж.** Гости (запросы) приходят к консьержу (Caddy/платформа), тот проверяет документы (TLS), открывает им дверь и звонит в квартиру. Квартира видит только звонок от консьержа и по умолчанию думает, что к ней пришли без охраны. Нужно, чтобы консьерж сообщал: «гость пришёл по HTTPS с такого-то адреса» (заголовки `X-Forwarded-*`).

**Миграция при старте — ремонт во время приёма гостей.** Один рабочий делает ремонт тихо. Два рабочих одновременно ломают одну стену.

**Мониторинг — сторож с телефоном.** Он не паникует после одного пропущенного звонка (сеть моргнула), но поднимает тревогу после нескольких подряд и сообщает, когда всё снова в порядке.

## Основная теория по шагам

### Шаг 1. Варианты размещения

| Вариант | Как | Плюсы | Минусы |
|---|---|---|---|
| **PaaS для контейнеров** (Render, Railway и аналоги) | подключаешь GitHub-репозиторий с Dockerfile, добавляешь управляемый PostgreSQL | минимум настройки, HTTPS из коробки | бесплатные тарифы ограничены и часто «засыпают» без трафика |
| **Azure** (App Service, Container Apps) | деплой контейнера или кода, Azure Database for PostgreSQL | экосистема .NET, строчка в резюме; для студентов бывает программа с кредитами | больше настроек, следи за расходами |
| **VPS** (любой провайдер) | сервер с Docker, `docker compose up -d`, reverse proxy с HTTPS | полный контроль, дёшево, учит Linux | всё администрирование на тебе |

:::warn Условия меняются
Бесплатные тарифы, лимиты и цены облачных платформ регулярно меняются. Перед выбором проверь актуальные условия на сайте платформы и **поставь лимит расходов / оповещения о бюджете**, если вводишь карту.
:::

Как выбрать: если цель «получить рабочую ссылку за вечер», бери PaaS; если цель «научиться администрировать и положить в резюме Linux/Docker», бери VPS; если целишься в вакансии с Azure, разверни там. Нормально сделать сначала PaaS, а потом, с опытом, перенести на VPS: хорошо упакованное в контейнер приложение переезжает легко (это и есть проверка переносимости). Ограничение «засыпающих» тарифов: первый запрос после простоя долгий; для демо-ссылки в резюме это плохо, поэтому либо тариф без сна, либо пробуждающий мониторинг (см. ниже) и честная пометка в README.

### Шаг 2. Чек-лист деплоя

- [ ] `ASPNETCORE_ENVIRONMENT=Production`: нет подробных ошибок в ответах, нет OpenAPI UI (или он закрыт)
- [ ] Все секреты — переменные окружения платформы, не в репозитории
- [ ] HTTPS: платформа даёт сама, на VPS — reverse proxy (Caddy получает сертификаты автоматически)
- [ ] Миграции применяются отдельным шагом (или при старте единственного экземпляра — осознанно)
- [ ] `/health` настроен как проверка здоровья платформы
- [ ] Логи доступны (консоль платформы или файл/сервис логов)
- [ ] Внешний мониторинг доступности раз в 5 минут с оповещением (бесплатные сервисы мониторинга uptime)
- [ ] Демо-данные и демо-аккаунт для ревьюера описаны в README

Добавь к чек-листу три пункта, которые часто забывают: приложение пишет логи в **стандартный вывод** (платформы собирают их оттуда, а файлы внутри контейнера пропадают при пересоздании); на сервере открыты только нужные порты (на VPS закрой всё, кроме SSH, 80 и 443); и у тебя есть план отката ([CI/CD](#p6-cicd)).

### Шаг 3. VPS: минимальная схема

~~~text Caddyfile
api.example.com {
    reverse_proxy api:8080
}
~~~

~~~yaml Добавка к compose.yaml на сервере
services:
  caddy:
    image: caddy:2
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - caddy_data:/data
    depends_on:
      - api
    restart: unless-stopped

volumes:
  caddy_data:
~~~

Caddy сам получает и продлевает TLS-сертификат для домена (домен должен указывать на IP сервера, а порты 80 и 443 быть доступными из интернета, иначе центр сертификации не подтвердит владение доменом). Порт API `8080` в этом случае наружу не публикуется — только 80/443 у Caddy. Том `caddy_data` хранит полученные сертификаты: если его потерять, Caddy запросит новые, а частые перезапросы упираются в лимиты центра сертификации. Проверим, что оба фрагмента согласованы: разберём их парсером YAML и убедимся, что API не публикует порты и что адрес в Caddyfile совпадает с именем сервиса и портом (запускали по-настоящему):

~~~python @nocheck
import re, yaml
compose = yaml.safe_load(open("caddy-compose.yaml", encoding="utf-8"))
caddyfile = open("Caddyfile", encoding="utf-8").read()
upstream = re.search(r"reverse_proxy\s+(\S+)", caddyfile).group(1)
print("публикуемые порты Caddy:", compose["services"]["caddy"]["ports"])
print("upstream в Caddyfile:", upstream)
print("том для сертификатов объявлен:", "caddy_data" in compose["volumes"])
print("перезапуск настроен:", compose["services"]["caddy"]["restart"])
~~~
~~~console
публикуемые порты Caddy: ['80:80', '443:443']
upstream в Caddyfile: api:8080
том для сертификатов объявлен: True
перезапуск настроен: unless-stopped
~~~

Это проверка формы, а не работы: запустится ли Caddy и получит ли сертификат, видно только на сервере с настоящим доменом.

### Шаг 4. Приложение за обратным прокси

Это самая частая «невидимая» проблема. Прокси завершает TLS и обращается к приложению по обычному `http`. Приложение видит запрос с адреса прокси по `http`, и всё, что зависит от схемы и адреса клиента (абсолютные ссылки в ответах, редиректы, перенаправление на HTTPS, журнал IP, ограничение частоты по IP), работает неправильно. Прокси передаёт настоящие значения в заголовках `X-Forwarded-For`, `X-Forwarded-Proto`, `X-Forwarded-Host`, а приложение должно **явно** согласиться им верить: иначе любой клиент мог бы подделать свой адрес. Запустим настоящий сервер дважды (без и с `UseForwardedHeaders`) и пришлём запрос так, как это сделал бы Caddy:

~~~csharp
using Microsoft.AspNetCore.HttpOverrides;

async Task Run(string title, bool forwarded)
{
    var builder = WebApplication.CreateBuilder();
    builder.WebHost.UseUrls("http://127.0.0.1:0");
    builder.Logging.ClearProviders();
    var app = builder.Build();
    if (forwarded)
        app.UseForwardedHeaders(new ForwardedHeadersOptions { ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto | ForwardedHeaders.XForwardedHost });
    app.MapGet("/who", (HttpContext c) => $"схема={c.Request.Scheme}, хост={c.Request.Host.Host}, клиент={c.Connection.RemoteIpAddress}");
    await app.StartAsync();

    using var http = new HttpClient { BaseAddress = new Uri(app.Urls.First()) };
    var req = new HttpRequestMessage(HttpMethod.Get, "/who");
    req.Headers.Add("X-Forwarded-For", "203.0.113.7");           // адрес из документационного диапазона
    req.Headers.Add("X-Forwarded-Proto", "https");
    req.Headers.Add("X-Forwarded-Host", "api.example.com");
    Console.WriteLine($"{title}: {await (await http.SendAsync(req)).Content.ReadAsStringAsync()}");
    await app.StopAsync();
}

await Run("без UseForwardedHeaders", forwarded: false);
await Run("с UseForwardedHeaders   ", forwarded: true);
~~~
~~~console
без UseForwardedHeaders: схема=http, хост=127.0.0.1, клиент=127.0.0.1
с UseForwardedHeaders   : схема=https, хост=api.example.com, клиент=203.0.113.7
~~~

Без middleware приложение «думает», что оно на `http` с адресом `127.0.0.1` и клиент у него один и тот же (прокси). С ним значения подставлены. Но есть нюанс, который виден только в Docker: по умолчанию middleware доверяет заголовкам **только от прокси на loopback-адресе** (в нашем примере клиент как раз локальный). В Compose Caddy обращается к API с другого адреса контейнерной сети, и заголовки будут проигнорированы. В документации ASP.NET Core в таком случае предлагают очистить списки `KnownNetworks`/`KnownProxies` (если порт API снаружи недоступен, то доверять заголовкам из внутренней сети безопасно) или перечислить адрес прокси. Если API доступен напрямую из интернета, этого делать нельзя: любой клиент подделает свой адрес.

Платформы вроде PaaS часто выставляют `ASPNETCORE_FORWARDEDHEADERS_ENABLED=true`: в шаблонах контейнеров это включает те же настройки; проверь по документации платформы.

### Шаг 5. Миграции в продакшене

~~~bash Пакет миграций — самодостаточный исполняемый файл
dotnet ef migrations bundle --self-contained -r linux-x64 -o efbundle
./efbundle --connection "Host=...;Database=app;Username=app;Password=..."
~~~

Варианты по возрастанию надёжности: `Database.Migrate()` при старте (просто, но опасно при нескольких экземплярах и долгих миграциях) → SQL-скрипт `migrations script --idempotent`, применяемый вручную → bundle как шаг CI/CD перед выкаткой новой версии. Команды EF здесь не запускались (пакеты недоступны), но проблему гонки можно воспроизвести без них. Напишем самый простой «мигратор» на SQL: таблица `schema_migrations` помнит, что применено; миграция выполняется, только если её там нет. Запустим два «экземпляра» одновременно на настоящем PostgreSQL. Миграция нарочно медленная (имитация долгой), чтобы оба экземпляра успели проверить таблицу до того, как первый её создаст:

~~~csharp
using System.Diagnostics;

string Psql(string db, string sql)
{
    var psi = new ProcessStartInfo("psql", ["-X", "-q", "-At", "-h", "/tmp", "-p", "5433", "-U", "postgres", "-d", db, "-c", sql])
        { RedirectStandardOutput = true, RedirectStandardError = true };
    using var p = Process.Start(psi)!;
    var o = p.StandardOutput.ReadToEnd(); p.StandardError.ReadToEnd(); p.WaitForExit();
    return p.ExitCode == 0 ? "ok" : "ошибка";
}

const string Migration = """
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM schema_migrations WHERE id = '001') THEN
        PERFORM pg_sleep(1);
        CREATE TABLE tasks(id serial PRIMARY KEY, title text NOT NULL);
        INSERT INTO schema_migrations(id) VALUES ('001');
      END IF;
    END $$;
    """;

string[] RunTwo(string db, bool withLock)
{
    Psql("postgres", $"DROP DATABASE IF EXISTS {db} WITH (FORCE)");
    Psql("postgres", $"CREATE DATABASE {db}");
    Psql(db, "CREATE TABLE schema_migrations(id text PRIMARY KEY)");
    var sql = (withLock ? "SELECT pg_advisory_lock(42); " : "") + Migration;      // блокировка на уровне сессии: второй ждёт первого
    var tasks = Enumerable.Range(0, 2).Select(_ => Task.Run(() => Psql(db, sql))).ToArray();
    Task.WaitAll(tasks);
    return tasks.Select(t => t.Result).ToArray();
}

var noLock = RunTwo("deploy_demo_nolock", withLock: false);
Console.WriteLine($"без блокировки: упавших экземпляров {noLock.Count(r => r == "ошибка")} из 2");

var locked = RunTwo("deploy_demo_lock", withLock: true);
Console.WriteLine($"с advisory-блокировкой: упавших экземпляров {locked.Count(r => r == "ошибка")} из 2");
var applied = Psql("deploy_demo_lock", "SELECT 1 / (SELECT count(*) FROM schema_migrations WHERE id = '001')");
Console.WriteLine($"миграция 001 записана ровно один раз: {applied == "ok"}");

Psql("postgres", "DROP DATABASE deploy_demo_nolock WITH (FORCE)");
Psql("postgres", "DROP DATABASE deploy_demo_lock WITH (FORCE)");
~~~
~~~console
без блокировки: упавших экземпляров 1 из 2
с advisory-блокировкой: упавших экземпляров 0 из 2
миграция 001 записана ровно один раз: True
~~~

Без блокировки оба экземпляра проверили «миграции 001 ещё нет» и взялись создавать таблицу, один упал с ошибкой, а в реальной жизни такой экземпляр не стартует, и платформа будет перезапускать его по кругу. С блокировкой второй дождался первого, увидел запись о применённой миграции и пропустил её. Именно это делают инструменты миграций (EF Core использует блокировку на время применения), но выбор «где запускать миграции» остаётся за тобой: выполнять их **один раз, отдельным шагом до выкатки**, надёжнее, чем в каждом экземпляре при старте.

Ещё одно правило: миграция должна быть **обратно совместимой** с предыдущей версией кода на время выкатки. Старая версия приложения ещё работает, пока новая стартует. Переименование колонки в один шаг ломает старую версию; делай «расширение → переключение → сжатие»: добавь новую колонку, выкати код, пишущий в обе, перенеси данные, выкати код, читающий новую, и только потом удали старую.

:::danger «Задеплоил в пятницу вечером»
Перед выкаткой: тесты зелёные, есть резервная копия базы ([копия](#p6-compose)), миграция проверена на копии данных. После: проверить `/health`, основной сценарий и логи. Это не формальность — это то, о чём спросят на собеседовании про «твой опыт деплоя».
:::

### Шаг 6. Мониторинг: когда сервис считается упавшим

Платформа может перезапускать контейнер, но о том, что сервис недоступен для людей, тебе должен сообщить **внешний** монитор: он проверяет ссылку снаружи, как это делал бы пользователь (бесплатные сервисы uptime-мониторинга проверяют адрес раз в несколько минут и пишут на почту или в мессенджер). Главная ошибка настройки: тревога после одной неудачи (ложные срабатывания, которым в итоге перестаёшь верить) или после десяти (слишком поздно). Покажем логику монитора на настоящем сервере: порог «2 неудачи подряд», сообщение о восстановлении, проверка не только кода ответа, но и времени:

~~~csharp
var healthy = true;
var builder = WebApplication.CreateBuilder();
builder.WebHost.UseUrls("http://127.0.0.1:0");
builder.Logging.ClearProviders();
var app = builder.Build();
app.MapGet("/health", () => healthy ? Results.Ok("Healthy") : Results.StatusCode(503));
await app.StartAsync();
using var http = new HttpClient { BaseAddress = new Uri(app.Urls.First()), Timeout = TimeSpan.FromSeconds(2) };

var monitor = new UptimeMonitor(threshold: 2);
async Task Tick(string note)
{
    bool ok;
    try { ok = (await http.GetAsync("/health")).IsSuccessStatusCode; } catch { ok = false; }
    Console.WriteLine($"проверка {monitor.Checks + 1} ({note}): {(ok ? "ok" : "сбой")} → {monitor.Observe(ok)}");
}

await Tick("всё хорошо");
healthy = false;
await Tick("первый сбой — возможно, сеть моргнула");
await Tick("второй сбой подряд");
await Tick("третий сбой — повторно не тревожим");
healthy = true;
await Tick("сервис вернулся");
await Tick("штатно");
await app.StopAsync();

public sealed class UptimeMonitor(int threshold)
{
    private int _failures;
    private bool _alerting;
    public int Checks { get; private set; }

    public string Observe(bool ok)
    {
        Checks++;
        if (ok)
        {
            _failures = 0;
            if (_alerting) { _alerting = false; return "ОПОВЕЩЕНИЕ: сервис восстановлен"; }
            return "тихо";
        }
        _failures++;
        if (_failures >= threshold && !_alerting) { _alerting = true; return "ОПОВЕЩЕНИЕ: сервис недоступен"; }
        return "тихо (ждём подтверждения)";
    }
}
~~~
~~~console
проверка 1 (всё хорошо): ok → тихо
проверка 2 (первый сбой — возможно, сеть моргнула): сбой → тихо (ждём подтверждения)
проверка 3 (второй сбой подряд): сбой → ОПОВЕЩЕНИЕ: сервис недоступен
проверка 4 (третий сбой — повторно не тревожим): сбой → тихо (ждём подтверждения)
проверка 5 (сервис вернулся): ok → ОПОВЕЩЕНИЕ: сервис восстановлен
проверка 6 (штатно): ok → тихо
~~~

Реальные сервисы мониторинга устроены так же: порог подряд идущих сбоев, оповещение один раз при падении и один раз при восстановлении. Проверяй не только `/health`, но хотя бы раз и главный пользовательский сценарий вручную: приложение может отвечать `200` на `/health`, а логин при этом не работать. Если платформа усыпляет бесплатный сервис, мониторинг раз в 5 минут заодно «будит» его, но злоупотреблять этим против условий платформы не стоит.

## Как это работает под капотом

- **TLS-терминация.** Прокси расшифровывает HTTPS и передаёт запрос приложению по обычному HTTP во внутренней сети. Приложению не нужен сертификат, но нужен способ узнать исходные схему и адрес (заголовки `X-Forwarded-*`).
- **Как Caddy получает сертификат.** По протоколу ACME центр сертификации проверяет, что ты управляешь доменом (например, обращается к серверу по порту 80/443 с проверочным запросом). Поэтому домен должен вести на сервер, а порты быть открытыми; сертификат автоматически продлевается до истечения срока.
- **Middleware пересылаемых заголовков** читает `X-Forwarded-*` и подменяет `Request.Scheme`, `Request.Host` и `Connection.RemoteIpAddress`, но только если запрос пришёл от доверенного прокси. Исходные значения он сохраняет в заголовках `X-Original-*`. Его нужно ставить **в начало** конвейера, до всего, что смотрит на схему и адрес ([порядок middleware](#p4-middleware)).
- **Образ неизменяем.** Один и тот же образ работает в тесте и в проде; различается только конфигурация (переменные окружения). Поэтому «собрал на сервере вручную» приводит к расхождениям.
- **Блокировки.** Рекомендательная (advisory) блокировка PostgreSQL не привязана к строке или таблице, это просто «числовой замок», который сессии договорились уважать; сессионная блокировка снимается при закрытии соединения.
- **Остановка и выкатка.** При выкатке новой версии оркестратор посылает старому контейнеру сигнал остановки, и приложение завершает текущие запросы в пределах таймаута остановки (по умолчанию 30 с, см. [фоновые службы](#p5-background)). Для остановки без потери запросов нужно, чтобы платформа сначала перестала слать трафик, а потом остановила процесс.
- **Логи.** Платформа читает стандартный вывод контейнера; файлы внутри контейнера исчезают вместе с ним. Структурные логи ([логирование](#p4-errors)) удобнее искать.
- **Откат.** Он работает мгновенно, только если предыдущий образ ещё хранится в реестре, а миграция обратно совместима с предыдущей версией кода.
- **Границы проверки.** Здесь воспроизведены механика заголовков, гонка миграций и логика монитора; поведение платформ, DNS и ACME зависит от внешних сервисов и проверяется только на месте.

## Типичные ошибки и ловушки

- **Приложение за прокси без `UseForwardedHeaders`.** Ссылки с `http://`, бесконечные редиректы на HTTPS, неверные IP в логах и ограничителях.
- **Доверять `X-Forwarded-*` от любого клиента.** Если API доступен напрямую из интернета, заголовки можно подделать.
- **`Database.Migrate()` при старте нескольких экземпляров** (гонка, долгая миграция блокирует старт и проверки).
- **Необратимая миграция без резервной копии** («удалить колонку» в день выкатки).
- **Секрет в образе или в репозитории.** Сменить такой секрет нужно сразу, даже после удаления файла.
- **`Development` в продакшене.** Подробные ошибки и Swagger UI открыты наружу.
- **Порт базы или панели управления в интернете.**
- **Нет внешнего мониторинга.** О падении узнаёшь от рекрутера.
- **Мониторинг по одной неудаче.** Ложные тревоги, которым перестают верить; или, наоборот, слишком редкие проверки.
- **Единственный `/health` проверяет всё.** Падение кэша перезапускает здоровое приложение ([health checks](#p6-compose)).
- **Бесплатный тариф «засыпает».** Первый запрос рекрутера висит 30 секунд; предупреди в README или выбери другой тариф.
- **Нет бюджета или оповещения о расходах** в облаке с привязанной картой.
- **Деплой без плана отката.** Новая версия сломана, а старый образ удалён или миграция необратима.
- **Данные демо оставлены пустыми.** Ревьюеру нечего смотреть; добавь демо-аккаунт и тестовые данные и опиши их в README.

## Вопросы с собеседований

:::spoiler Как ты деплоил своё приложение?
Хороший ответ называет конкретику: Docker-образ из CI, реестр, платформа или VPS с Compose, Caddy для HTTPS, секреты в переменных окружения, миграции отдельным шагом, `/health` и внешний мониторинг, как откатываешься. Один рабочий опыт убедительнее теории.
:::

:::spoiler Почему Database.Migrate() при старте опасен при нескольких экземплярах?
Экземпляры стартуют одновременно и пытаются применить одну и ту же миграцию параллельно; долгая миграция задерживает старт и проверку здоровья. Поэтому в продакшене миграции выносят в отдельный шаг развёртывания.
:::

:::spoiler Что проверить сразу после деплоя?
`/health`, основной пользовательский сценарий (логин, создание, чтение), логи на ошибки, что миграции применены, что мониторинг видит сервис.
:::

:::spoiler Приложение за nginx/Caddy строит ссылки с http:// вместо https://. В чём дело? (ловушка: «настрой Caddy»)
Прокси завершает TLS, а приложение получает обычный HTTP. Нужно включить middleware пересылаемых заголовков (`UseForwardedHeaders`), чтобы оно доверило `X-Forwarded-Proto/For/Host`, и ограничить доверие известным прокси.
:::

:::spoiler Как выполнить миграцию без простоя и потери данных?
Делать миграции обратно совместимыми (расширение → переключение → сжатие), применять их один раз отдельным шагом до выкатки, иметь резервную копию и проверять на копии данных.
:::

:::spoiler Где хранить секреты в продакшене и как их менять?
В переменных окружения/хранилище секретов платформы, не в репозитории и не в образе. При подозрении на утечку секрет заменяют (а не просто удаляют файл) и перевыкатывают приложение.
:::

:::spoiler Как работает автоматический HTTPS в Caddy?
Caddy по протоколу ACME доказывает центру сертификации владение доменом (домен указывает на сервер, порты 80/443 доступны), получает сертификат и автоматически продлевает его.
:::

:::spoiler Как организовать мониторинг, чтобы не было ложных тревог?
Внешняя проверка с порогом подряд идущих сбоев, оповещение при падении и при восстановлении, проверка не только кода ответа, но и важного сценария; отдельные проверки живости и готовности.
:::

## Что запомнить

- Критерий: публичная ссылка с HTTPS, стабильная больше недели; деплой доказывает переносимость проекта.
- Выбор площадки: PaaS быстро, Azure для экосистемы, VPS для обучения администрированию; условия тарифов проверяй на сайте и ставь лимит расходов.
- Production-режим, секреты в переменных окружения, логи в стандартный вывод, закрытые порты базы.
- За прокси нужен `UseForwardedHeaders` с ограниченным доверием; иначе схема, хост и IP клиента неверны.
- Миграции применяются один раз отдельным шагом, обратно совместимо, с резервной копией; `Migrate()` в каждом экземпляре опасен.
- Внешний мониторинг с порогом подряд идущих сбоев и оповещением о восстановлении.
- Заранее проверь откат на предыдущий образ.
- Здесь воспроизведены заголовки прокси, гонка миграций и логика монитора; платформы, DNS и сертификаты проверяются только на месте.

## Практика

- [ ] Выбрал платформу, задеплоил капстоун, получил публичную ссылку с HTTPS
- [ ] Настроил внешний мониторинг `/health` с оповещением
- [ ] Применил миграции через bundle или скрипт, а не вручную в консоли базы
- [ ] Неделю без падений: веду заметку с датой деплоя и инцидентами

@@page id="p6-cicd" phase="6" kind="topic" title="CI/CD: от push до продакшена" nav="CI/CD" est="4–5 дней"
:::why
В Фазе 5 CI проверял сборку и тесты. CD добавляет вторую половину: после зелёных тестов на `main` новая версия **собирается в образ и выкатывается сама**. Капстоун из критериев требует именно CI/CD.
:::

## Зачем это нужно

Ручной деплой («зайти по SSH, подтянуть код, пересобрать, перезапустить») медленный, нервный и невоспроизводимый: каждый раз немного иначе, а в пятницу вечером ещё и с ошибкой. CI/CD превращает выпуск версии в **скучную, одинаковую процедуру**, которую запускает `git push`. Это сразу даёт четыре вещи:

- скорость: от слияния PR до рабочей ссылки проходят минуты, а не вечер;
- безопасность: в прод попадает только то, что прошло тесты;
- воспроизводимость: любой образ можно собрать заново из конкретного коммита, а выложить ту же версию ещё раз;
- возможность быстро откатиться: предыдущая версия лежит в реестре и ждёт.

Расшифровка терминов, на которые собеседующие любят давить: **CI** (Continuous Integration) — частое слияние кода с автоматической сборкой и тестами. **Continuous Delivery** — каждая зелёная версия *готова* к выкатке, а запуск остаётся за человеком (кнопка). **Continuous Deployment** — зелёная версия выкатывается в прод *автоматически*. Для капстоуна подходит второе, но разумно оставить в конвейере «ручную кнопку» для продакшена, если в проекте есть реальные пользователи.

Честная оговорка: GitHub Actions, GHCR, платформы и SSH-серверы недоступны в нашей учебной среде, поэтому сам конвейер здесь не запускался. Проверено то, что можно проверить: workflow разобран парсером YAML и проверен линтером (порядок заданий, условия, права, секреты), а логика, которая отличает хороший деплой от плохого (проверка после выкатки и автоматический откат), воспроизведена на настоящем сервере. Поведение GitHub описано по документации.

## Интуиция и аналогия

**Конвейер на заводе.** Деталь (коммит) движется по ленте: контроль качества (тесты), упаковка (образ), склад (реестр), отправка (деплой). Если контроль забраковал деталь, лента дальше не едет. Рабочему не нужно ничего носить руками.

**Образ как запечатанная коробка с этикеткой.** В коробке всё, что нужно для работы, и на ней написан номер партии (хэш коммита). Отправить «ту же коробку» в другое место или вернуть старую партию можно по этикетке. А надпись `latest` — это «последняя коробка, которую кто-то поставил на полку»: удобно, но непонятно, какая именно.

**Откат — кнопка «назад» в лифте.** Лучше нажать её сразу, чем разбираться, почему лифт застрял между этажами.

## Основная теория по шагам

### Шаг 1. Конвейер целиком

~~~text
 push / PR ──▶ build + test ──▶ (только main) собрать Docker-образ ──▶ опубликовать в реестр
                                                                         │
                                                                         ▼
                                                        деплой: платформа или сервер подтягивает новый образ
~~~

Ключевая идея: **один раз собранный образ проходит все окружения без изменений**; различается только конфигурация. Не пересобирай образ на сервере и не собирай разные образы для теста и прода.

### Шаг 2. Workflow сборки и публикации

~~~yaml .github/workflows/ci-cd.yml
name: CI/CD

on:
  push:
    branches: [ main ]
  pull_request:
    branches: [ main ]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-dotnet@v4
        with:
          dotnet-version: '10.0.x'
      - run: dotnet restore
      - run: dotnet build --no-restore -c Release
      - run: dotnet test --no-build -c Release

  image:
    needs: test                                   # только после зелёных тестов
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write                             # право публиковать в GitHub Container Registry
    steps:
      - uses: actions/checkout@v4
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - uses: docker/build-push-action@v6
        with:
          context: .
          push: true
          tags: |
            ghcr.io/<логин-в-нижнем-регистре>/<репозиторий>:latest
            ghcr.io/<логин-в-нижнем-регистре>/<репозиторий>:${{ github.sha }}

  deploy:
    needs: image
    runs-on: ubuntu-latest
    steps:
      - name: Trigger deploy
        run: curl -fsS -X POST "${{ secrets.DEPLOY_HOOK_URL }}"   # deploy hook платформы
~~~

- Имя образа в GHCR должно быть **в нижнем регистре**.
- Тег `${{ github.sha }}` позволяет откатиться на конкретную версию: «что сейчас на проде» = конкретный коммит.
- Для PaaS последний шаг — **deploy hook** (URL из настроек платформы, хранится в Secrets). Для VPS — шаг с SSH: `docker compose pull && docker compose up -d` (ключ тоже в Secrets).

Проверим файл линтером: разберём YAML и убедимся, что конвейер именно такой, как задумано (цепочка заданий, условие на `main`, права, секреты). Запуск на этом файле дал (по-настоящему):

~~~python @nocheck
import re, yaml
text = open("cicd.yaml", encoding="utf-8").read()
wf = yaml.safe_load(text)
jobs = wf["jobs"]
print("задания:", " → ".join(jobs))
for name, job in jobs.items():
    print(f"  {name}: needs={job.get('needs') or '-'}; if={job.get('if') or '-'}")
print("используемые секреты:", ", ".join(sorted(set(re.findall(r"secrets\.(\w+)", text)))))
print("право на публикацию пакетов:", jobs["image"]["permissions"].get("packages"))
~~~
~~~console
задания: test → image → deploy
  test: needs=-; if=-
  image: needs=test; if=github.event_name == 'push' && github.ref == 'refs/heads/main'
  deploy: needs=image; if=-
используемые секреты: DEPLOY_HOOK_URL, GITHUB_TOKEN
право на публикацию пакетов: write
~~~

Из этого видно главное: у `test` нет условий, поэтому он идёт и на каждом PR; `image` требует и зелёных тестов, и события push в `main`. У `deploy` своего условия нет, но он зависит от `image`: по документации GitHub, если нужное задание пропущено, зависимое тоже пропускается, поэтому на PR выкатки не будет. `GITHUB_TOKEN` не нужно создавать: GitHub выдаёт его сам.

### Шаг 3. Имена и теги образа

Имя образа в реестре — строго нижний регистр, а твой логин на GitHub может содержать заглавные буквы. Не надейся, что «само получится»: приведи регистр в шаге workflow. Короткий тег по хэшу делает команды читаемее. Оболочка Bash умеет и то и другое (проверим вживую, потому что именно она выполняет `run:` на раннере):

~~~csharp
using System.Diagnostics;

string Bash(string script)
{
    var psi = new ProcessStartInfo("bash", ["-c", script]) { RedirectStandardOutput = true };
    psi.Environment["GITHUB_REPOSITORY"] = "Valera/Task-Tracker";            // как в Actions: владелец/репозиторий, регистр сохранён
    psi.Environment["GITHUB_SHA"] = "3f9a1c2b7d8e4f5a6b0c1d2e3f4a5b6c7d8e9f01";
    using var p = Process.Start(psi)!;
    var o = p.StandardOutput.ReadToEnd(); p.WaitForExit();
    return o.Trim();
}

Console.WriteLine("репозиторий:  " + Bash("echo \"$GITHUB_REPOSITORY\""));
Console.WriteLine("имя образа:   " + Bash("echo \"ghcr.io/${GITHUB_REPOSITORY,,}\""));
Console.WriteLine("короткий тег: " + Bash("echo \"${GITHUB_SHA:0:7}\""));
Console.WriteLine("полный тег:   " + Bash("echo \"ghcr.io/${GITHUB_REPOSITORY,,}:${GITHUB_SHA}\""));
~~~
~~~console
репозиторий:  Valera/Task-Tracker
имя образа:   ghcr.io/valera/task-tracker
короткий тег: 3f9a1c2
полный тег:   ghcr.io/valera/task-tracker:3f9a1c2b7d8e4f5a6b0c1d2e3f4a5b6c7d8e9f01
~~~

Конструкции `${VAR,,}` (в нижний регистр) и `${VAR:0:7}` (первые семь символов) — возможности Bash, их и используют в шагах `run:`. Чтобы передать вычисленное значение следующему шагу, в Actions записывают его в файл `$GITHUB_ENV`, например `echo "IMAGE=ghcr.io/${GITHUB_REPOSITORY,,}" >> "$GITHUB_ENV"`.

### Шаг 4. Деплой на VPS и откат

Для VPS последний шаг задания `deploy` заходит на сервер и обновляет стек. В Compose-файле на сервере тег образа удобно сделать переменной, чтобы одной командой выбрать версию:

~~~yaml compose.yaml на сервере (фрагмент)
services:
  api:
    image: ghcr.io/<логин>/<репозиторий>:${IMAGE_TAG:-latest}
    restart: unless-stopped
~~~

~~~yaml Шаг деплоя по SSH (фрагмент задания deploy)
    environment: production                  # окружение GitHub: можно требовать ручное подтверждение
    concurrency: deploy-production           # два деплоя не идут одновременно
    steps:
      - name: Подготовить ключ
        run: |
          install -m 700 -d ~/.ssh
          echo "${{ secrets.SSH_KEY }}" > ~/.ssh/id_deploy && chmod 600 ~/.ssh/id_deploy
          ssh-keyscan -H "${{ secrets.SSH_HOST }}" >> ~/.ssh/known_hosts
      - name: Выкатить версию
        run: |
          ssh -i ~/.ssh/id_deploy deploy@${{ secrets.SSH_HOST }} \
            "cd /srv/app && IMAGE_TAG=${{ github.sha }} docker compose pull api && IMAGE_TAG=${{ github.sha }} docker compose up -d api"
~~~

Секрет `SSH_KEY` — отдельный ключ только для деплоя, с ограниченными правами на сервере (не твой личный). Окружение `production` в настройках репозитория позволяет добавить обязательное подтверждение перед выкаткой и ограничить, какие ветки могут выкатывать. Оба фрагмента YAML разобраны парсером (синтаксис корректен), но сам вход на сервер не выполнялся.

Откат: `IMAGE_TAG=<предыдущий-хэш> docker compose up -d api`: достаточно знать, какой тег был до этого (поэтому тег с хэшем, а не `latest`).

### Шаг 5. Проверка после выкатки и автоматический откат

Выкатить — не значит «работает». Настоящий деплой завершается проверкой: подождать, пока новая версия начнёт отвечать на `/health`, и если не начала за разумное время, вернуть предыдущую. Именно эту логику стоит держать в конвейере (в `curl --retry` в SSH-шаге или в скрипте). Воспроизведём её на настоящем сервере: у «приложения» есть несколько версий, одна стартует медленно (два первых ответа `503`), другая сломана:

~~~csharp
var slowStartCalls = 0;
var running = "v1";
var builder = WebApplication.CreateBuilder();
builder.WebHost.UseUrls("http://127.0.0.1:0");
builder.Logging.ClearProviders();
var app = builder.Build();
app.MapGet("/health", () => running switch
{
    "v2-slow" => ++slowStartCalls <= 2 ? Results.StatusCode(503) : Results.Ok(),      // прогревается
    "v3-broken" => Results.StatusCode(500),                                            // никогда не станет здоровой
    _ => Results.Ok()
});
await app.StartAsync();
using var http = new HttpClient { BaseAddress = new Uri(app.Urls.First()), Timeout = TimeSpan.FromSeconds(2) };

var history = new List<string> { "v1" };
async Task<bool> Deploy(string tag, int attempts)
{
    var previous = running;
    running = tag;                                           // «docker compose up -d» с новым тегом
    for (int i = 1; i <= attempts; i++)
    {
        var ok = (await http.GetAsync("/health")).IsSuccessStatusCode;
        if (ok) { Console.WriteLine($"деплой {tag}: здорова с проверки №{i}"); history.Add(tag); return true; }
        await Task.Delay(20);
    }
    running = previous;                                      // откат на прошлый тег
    Console.WriteLine($"деплой {tag}: не стала здоровой за {attempts} проверок → откат на {previous}");
    return false;
}

await Deploy("v2-slow", attempts: 5);
await Deploy("v3-broken", attempts: 5);
Console.WriteLine($"сейчас работает: {running}; история успешных версий: {string.Join(" → ", history)}");

await app.StopAsync();
~~~
~~~console
деплой v2-slow: здорова с проверки №3
деплой v3-broken: не стала здоровой за 5 проверок → откат на v2-slow
сейчас работает: v2-slow; история успешных версий: v1 → v2-slow
~~~

Версия `v2-slow` прошла проверку с третьей попытки: терпеть прогрев нужно, мгновенный отказ после первой же проверки дал бы ложный откат. Версия `v3-broken` исчерпала попытки, и конвейер вернул `v2-slow`. Это упрощённая модель (настоящий откат — это перезапуск контейнера со старым тегом), но решение такое же: ограниченное число попыток, терпимость к медленному старту, понятный результат. Миграции базы в такой схеме выполняются **до** выкатки и обязаны быть обратно совместимыми, иначе откат кода не спасёт ([миграции](#p6-deploy)).

:::tip Откат
Хорошая привычка — уметь откатиться за минуту: перезапустить предыдущий тег образа. Попробуй один раз заранее, а не в момент аварии.
:::

## Как это работает под капотом

- **Реестр и теги.** Образ состоит из слоёв, а реестр хранит их по содержимому. Тег — это подвижная ссылка на «манифест» образа, поэтому `latest` можно перенацелить на другой образ. Привязка по **digest** (`@sha256:…`) неизменна: это точный адрес содержимого. Тег-хэш коммита стабилен на практике, пока никто не публикует поверх него.
- **Кэш слоёв.** Сборка образа переиспользует слои, если не изменились команды и копируемые файлы. Поэтому в Dockerfile сначала копируют файлы проекта и выполняют `restore`, а исходный код копируют позже ([Docker](#p4-docker)). Кэш между прогонами CI требует отдельной настройки (в Actions, например, кэш сборщика), иначе каждая сборка начинается с нуля.
- **`GITHUB_TOKEN` и `permissions`.** Токен создаётся на время прогона, а его права задаёт блок `permissions`: для публикации пакета нужно `packages: write`. Пакет в GHCR по умолчанию приватный; чтобы сервер мог его скачать, нужен вход (`docker login`) с токеном, имеющим право чтения, либо публичный пакет.
- **Зависимости заданий.** `needs` строит граф: задания без зависимостей идут параллельно, зависимые ждут и пропускаются, если нужное задание не выполнялось или упало (если не указано `if: always()`).
- **Окружения и подтверждения.** Задание с `environment: production` может ожидать одобрения людей из списка и получает секреты, привязанные к окружению, а не ко всему репозиторию.
- **`concurrency`.** Ключ группы гарантирует, что одновременно выполняется одно задание группы, а следующие ждут. Для деплоя это защита от гонки двух выкаток.
- **Что значит «деплой выполнен».** Для PaaS hook лишь *запускает* выкатку, а результат узнаёшь по платформе: убедись, что конвейер ждёт здоровья, а не считает успехом факт вызова `curl`.
- **Неизменяемость.** Выкатывается ровно тот образ, который прошёл тесты (по тегу-хэшу): исправление «на сервере руками» создаёт расхождение между кодом и продом.
- **Стоимость минут.** Каждый прогон тратит минуты раннера (лимиты зависят от тарифа, проверь условия). Отмена устаревших прогонов (`concurrency` с `cancel-in-progress`) экономит их, но для деплоя отмену включать нельзя: прерванная выкатка опаснее ожидания.

## Типичные ошибки и ловушки

- **Образ в верхнем регистре или с неверным именем.** Публикация падает; приведи регистр в шаге workflow.
- **Деплой по тегу `latest`.** Непонятно, что работает, и откатиться некуда. Выкатывай по хэшу.
- **Секреты в логах или в репозитории.** Значения секретов маскируются, но `echo` в файл или вывод `env` могут их раскрыть; личный SSH-ключ вместо отдельного деплойного.
- **Деплой без проверки здоровья.** Конвейер зелёный, а сайт лежит. Считай успехом только прошедшую проверку.
- **Бесконечное ожидание или единственная попытка.** Либо зависший конвейер, либо ложный откат при прогреве.
- **Миграция, ломающая старую версию.** Откат кода не помогает, если схема уже изменилась необратимо.
- **Образ пересобирается на сервере.** Версия на проде не совпадает с тем, что тестировал CI.
- **Пакет в GHCR приватный, а сервер не вошёл в реестр.** `pull access denied`.
- **Два деплоя одновременно.** Нет `concurrency`: версии перезаписывают друг друга.
- **Автодеплой на каждый коммит при отсутствии тестов.** Скорость есть, безопасности нет.
- **Деплой запускается на PR из форка.** Событие `pull_request` из форка не получает секреты, а `pull_request_target` опасно запускать с чужим кодом ([CI](#p5-ci)).
- **Откат ни разу не пробовали.** В аварию окажется, что предыдущего образа нет или команда не работает.

## Вопросы с собеседований

:::spoiler Чем Continuous Delivery отличается от Continuous Deployment?
Delivery: каждая зелёная версия готова к выкатке, но запускает её человек. Deployment: зелёная версия выкатывается автоматически без ручного шага.
:::

:::spoiler Зачем `needs: test` перед сборкой образа?
Чтобы образ собирался и выкатывался только при зелёных тестах — сломанная версия не попадёт на прод.
:::

:::spoiler Зачем тегировать образ хэшем коммита, если есть latest?
`latest` постоянно перезаписывается. Тег с хэшем однозначно связывает развёрнутую версию с кодом и даёт возможность откатиться на конкретную версию.
:::

:::spoiler Как откатиться на прошлую версию? (ловушка: «git revert и снова весь конвейер»)
Самый быстрый путь: перезапустить предыдущий тег образа, он уже лежит в реестре и прошёл тесты. `git revert` и новый прогон тоже допустимы, но медленнее. Нужно, чтобы миграции были обратно совместимыми.
:::

:::spoiler Как убедиться, что деплой удался?
Проверкой после выкатки: опросить `/health` (и ключевой сценарий) с ограниченным числом попыток; при неудаче откатиться и сообщить. Факт запуска команды деплоя успехом не считается.
:::

:::spoiler Где хранить пароли и ключи для деплоя и как ограничить их использование?
В Secrets репозитория или окружения; для SSH — отдельный деплойный ключ с минимальными правами; окружение `production` может требовать одобрения и ограничивать ветки.
:::

:::spoiler Почему образ собирают один раз, а не отдельно для каждого окружения?
Чтобы в проде работало ровно то, что прошло тесты. Различия окружений задаются конфигурацией (переменными), а не пересборкой.
:::

:::spoiler Что такое digest образа и чем он отличается от тега?
Digest — хэш содержимого образа, неизменный адрес. Тег — подвижная метка, которую можно перенацелить на другой образ (как `latest`).
:::

## Что запомнить

- CI проверяет, CD выкатывает; Delivery — по кнопке, Deployment — автоматически.
- Конвейер: тесты → образ (только `main`) → реестр → деплой; `needs` задаёт порядок, `if` — условия.
- Образ собирается один раз и идёт по окружениям без изменений; различается только конфигурация.
- Тег — хэш коммита (и имя в нижнем регистре); `latest` для выкатки не годится.
- Секреты в Secrets, деплойный ключ отдельный и ограниченный; права токена задаёт `permissions`.
- Деплой считается успешным только после проверки здоровья; при неудаче откат на предыдущий тег.
- Миграции до выкатки и обратно совместимые, иначе откат бессилен.
- Здесь проверены структура YAML, bash-конструкции и логика проверки с откатом; запуск на GitHub и на сервере проверь в своём репозитории.

## Практика

- [ ] Workflow собирает и публикует образ при push в `main`
- [ ] Деплой запускается автоматически после публикации образа
- [ ] Сделал изменение → PR → merge → увидел его на публичной ссылке без ручных действий
- [ ] Отработал откат на предыдущий образ

@@page id="p6-cache" phase="6" kind="topic" title="Кэш, Redis, rate limiting и устойчивость" nav="Кэш, Redis, rate limiting" est="~1 неделя"
:::why
«Почему у нас тут кэш» — типичный вопрос junior-собеседования по системному дизайну. Кэш, ограничение частоты запросов и повторы при сбоях — три базовых инструмента, чтобы API выдерживал нагрузку и капризы внешних сервисов.
:::

## Зачем это нужно

Любой работающий сервис рано или поздно упирается в одно из трёх: **база не успевает** отвечать на одинаковые тяжёлые запросы, **клиенты шлют слишком много** запросов (злонамеренно или по ошибке), **соседние сервисы сбоят** и тянут тебя за собой. Для каждого из этих случаев есть стандартный инструмент:

- **кэш** снимает повторную работу: тяжёлый расчёт делается один раз, а потом ответ берётся из быстрой памяти;
- **ограничение частоты (rate limiting)** защищает от перегрузки и перебора паролей;
- **устойчивость (повторы, таймауты, circuit breaker)** позволяет пережить временные сбои внешних сервисов.

Ни один из них не бесплатен. Кэш приносит *устаревшие данные* и новый класс багов («в базе уже другое, а на экране старое»). Ограничитель при неверной настройке режет честных пользователей. Повторы без осторожности создают дубли. Поэтому на собеседовании ценится не «я добавил Redis», а ответ на вопросы: **какую проблему решает, что с устареванием, что будет, если он упадёт, как это проверено**.

Что мы проверим руками. На этой странице нет ни одной «магии из библиотеки»: кэш-логика работает с **настоящим сервером Redis 7**, к которому мы обращаемся по его собственному протоколу (RESP) из нескольких десятков строк кода, а ограничитель частоты — это встроенный в ASP.NET Core на живом сервере. NuGet в нашей среде недоступен, поэтому пакеты `StackExchange.Redis`, `Microsoft.Extensions.Caching.StackExchangeRedis`, `HybridCache` и `Microsoft.Extensions.Http.Resilience` не запускались: их код приведён по документации, а принципы показаны на проверенных примерах.

## Интуиция и аналогия

**Кэш — шпаргалка на столе.** Спрашивают одно и то же: заглядывать в толстый справочник (базу) каждый раз долго, поэтому ответ записан на стикере. Стикер быстрый, но может устареть: если справочник обновили, а стикер нет, ты уверенно скажешь неправду. Поэтому на стикере пишут срок годности (TTL) и выбрасывают его, когда знаешь, что данные изменились (инвалидация).

**Лавина промахов (cache stampede) — очередь у пустой полки.** Только что закончился популярный товар, и двадцать покупателей одновременно бегут на склад. Правильно, чтобы сходил один и принёс всем.

**Rate limiting — турникет в метро.** Не «не пускать вообще», а «не больше N человек в минуту». Турникеты на каждой станции отдельные (локальный ограничитель в каждом экземпляре), а общий лимит на линию требует общего счётчика (Redis).

**Повтор запроса — повторный звонок, когда не дозвонился.** Если ты не знаешь, услышал ли собеседник твою просьбу «закажи пиццу», повторять её рискованно: закажут две. Нужен «номер заказа», по которому дубль узнают (ключ идемпотентности).

## Основная теория по шагам

### Шаг 1. Cache-aside — самый частый паттерн

~~~text
 запрос → есть в кэше? ── да ──▶ вернуть из кэша (быстро)
                  │
                  нет
                  ▼
          прочитать из БД → положить в кэш с TTL → вернуть
 изменение данных → записать в БД → удалить ключ из кэша (инвалидация)
~~~

Приложение само отвечает за кэш (отсюда «aside» — «сбоку»): кэш не знает про базу, база не знает про кэш. Запустим это на настоящем Redis. Мини-клиент `Redis` ниже говорит на протоколе RESP: команда отправляется как список строк, ответ приходит одним из пяти типов. Это учебная замена библиотеке, чтобы увидеть, что «внутри» нет ничего волшебного:

~~~csharp
using System.Globalization;
using System.Net.Sockets;
using System.Text;

var redis = await Redis.ConnectAsync("127.0.0.1", 6390);
await redis.CallAsync("FLUSHALL");

var dbCalls = 0;
var dbValue = "статистика-1";
async Task<string> Db(int id) { dbCalls++; await Task.Delay(30); return dbValue; }                 // «тяжёлый запрос»

async Task<string> Get(int id)
{
    var key = $"stats:v1:{id}";                                                                    // версия формата в ключе
    if (await redis.CallAsync("GET", key) is string cached) return cached;                          // попадание
    var value = await Db(id);                                                                       // промах → читаем из базы
    await redis.CallAsync("SET", key, value, "PX", 300);                                            // кладём с TTL 300 мс
    return value;
}

Console.WriteLine($"1. первый запрос: {await Get(1)}, обращений к базе: {dbCalls}");
await Get(1); await Get(1);
Console.WriteLine($"2. ещё два запроса:  обращений к базе: {dbCalls} (остальное из кэша)");
var ttl = (long)(await redis.CallAsync("PTTL", "stats:v1:1"))!;
Console.WriteLine($"3. у ключа есть срок жизни: {ttl is > 0 and <= 300}");

dbValue = "статистика-2";                                                                           // данные в базе изменились…
Console.WriteLine($"4. без инвалидации кэш отдаёт старое: {await Get(1)}");
await redis.CallAsync("DEL", "stats:v1:1");                                                         // …и мы удалили ключ
Console.WriteLine($"5. после DEL берём из базы свежее:   {await Get(1)}, обращений к базе: {dbCalls}");

await Task.Delay(400);                                                                              // TTL истёк
var expired = await redis.CallAsync("GET", "stats:v1:1");
Console.WriteLine($"6. после истечения TTL ключа нет:    {expired is null}");

// Redis недоступен (порт, на котором никого нет): приложение обязано работать медленнее, но не падать
async Task<string> GetSafe(int id)
{
    try
    {
        using var broken = await Redis.ConnectAsync("127.0.0.1", 6391);
        if (await broken.CallAsync("GET", $"stats:v1:{id}") is string cached) return cached;
    }
    catch (Exception e) when (e is SocketException or OperationCanceledException or IOException)
    {
        Console.WriteLine("7. Redis недоступен → идём в базу напрямую");
    }
    return await Db(id);
}
Console.WriteLine($"   ответ без кэша: {await GetSafe(1)}");
redis.Dispose();

public sealed class Redis : IDisposable
{
    private readonly TcpClient _tcp = new();
    private Stream _out = null!, _in = null!;
    private readonly SemaphoreSlim _gate = new(1, 1);

    public static async Task<Redis> ConnectAsync(string host, int port)
    {
        var r = new Redis();
        using var cts = new CancellationTokenSource(1000);
        await r._tcp.ConnectAsync(host, port, cts.Token);
        r._out = r._tcp.GetStream();
        r._in = new BufferedStream(r._out);
        return r;
    }

    public async Task<object?> CallAsync(params object[] args)
    {
        await _gate.WaitAsync();
        try
        {
            var msg = new MemoryStream();
            void Write(string text) { var b = Encoding.UTF8.GetBytes(text); msg.Write(b, 0, b.Length); }
            Write($"*{args.Length}\r\n");                                                              // массив из N строк
            foreach (var a in args)
            {
                var bytes = Encoding.UTF8.GetBytes(Convert.ToString(a, CultureInfo.InvariantCulture)!);
                Write($"${bytes.Length}\r\n"); msg.Write(bytes, 0, bytes.Length); Write("\r\n");
            }
            await _out.WriteAsync(msg.ToArray());
            return await ReadReplyAsync();
        }
        finally { _gate.Release(); }
    }

    private async Task<int> ReadByteAsync()
    {
        var buf = new byte[1];
        if (await _in.ReadAsync(buf) == 0) throw new IOException("соединение закрыто");
        return buf[0];
    }

    private async Task<string> ReadLineAsync()
    {
        var sb = new StringBuilder();
        while (true)
        {
            var b = await ReadByteAsync();
            if (b == '\r') { await ReadByteAsync(); return sb.ToString(); }
            sb.Append((char)b);
        }
    }

    private async Task<object?> ReadReplyAsync()
    {
        var type = (char)await ReadByteAsync();
        var line = await ReadLineAsync();
        switch (type)
        {
            case '+': return line;                                                                      // простая строка (OK)
            case '-': throw new InvalidOperationException(line);                                        // ошибка
            case ':': return long.Parse(line);                                                          // число
            case '$':                                                                                   // строка с длиной; -1 = null
                var n = int.Parse(line);
                if (n < 0) return null;
                var buf = new byte[n + 2];
                for (int off = 0; off < buf.Length;)
                {
                    var read = await _in.ReadAsync(buf.AsMemory(off));
                    if (read == 0) throw new IOException("соединение закрыто");
                    off += read;
                }
                return Encoding.UTF8.GetString(buf, 0, n);
            default: throw new NotSupportedException($"тип ответа {type}");
        }
    }

    public void Dispose() => _tcp.Dispose();
}
~~~
~~~console
1. первый запрос: статистика-1, обращений к базе: 1
2. ещё два запроса:  обращений к базе: 1 (остальное из кэша)
3. у ключа есть срок жизни: True
4. без инвалидации кэш отдаёт старое: статистика-1
5. после DEL берём из базы свежее:   статистика-2, обращений к базе: 2
6. после истечения TTL ключа нет:    True
7. Redis недоступен → идём в базу напрямую
   ответ без кэша: статистика-2
~~~

Каждая строка — отдельный урок. Пункт 4 показывает главную цену кэша: данные в базе уже новые, а кэш отдаёт старые, пока их не удалят или не истечёт TTL. Пункт 5: удаление ключа при изменении (инвалидация) возвращает свежее, но только если ты **не забыл** удалить его во всех местах записи. Пункт 6: TTL работает как страховка на случай забытой инвалидации. Пункт 7: если кэш недоступен, приложение должно продолжать работать медленнее, а не падать: кэш — оптимизация, а не источник истины.

:::key Две трудные вещи
Кэш почти всегда означает компромисс **свежести** ради скорости. Отвечай на вопросы: сколько секунд устаревших данных допустимо (TTL)? Кто и когда удаляет ключ при изменении (инвалидация)? Что будет, если Redis недоступен (приложение должно работать, только медленнее)? Версия в ключе (`v1`) позволяет безопасно поменять формат данных.
:::

### Шаг 2. IMemoryCache или распределённый кэш

| | `IMemoryCache` | `IDistributedCache` (Redis) |
|---|---|---|
| Где живёт | в памяти процесса | отдельный сервер |
| Несколько экземпляров API | у каждого свой кэш — данные расходятся | общий кэш |
| Переживает перезапуск API | нет | да |
| Скорость | максимальная | сетевой вызов (обычно доли миллисекунды в одной сети) |

`HybridCache` (пакет `Microsoft.Extensions.Caching.Hybrid`, .NET 9+) объединяет оба уровня (быстрый локальный и общий) и по документации защищает от «лавины» одновременных промахов. В .NET-приложении с Redis подключение выглядит так (код приведён по документации, пакеты в нашей среде не запускались):

~~~bash
dotnet add package Microsoft.Extensions.Caching.StackExchangeRedis
~~~

~~~csharp Cache-aside через IDistributedCache @nocheck
using System.Text.Json;
using Microsoft.Extensions.Caching.Distributed;

// Program.cs:
// builder.Services.AddStackExchangeRedisCache(o => o.Configuration = builder.Configuration.GetConnectionString("Redis"));

public sealed class ProjectStatsService(IDistributedCache cache, IProjectStatsQuery query)
{
    private static readonly DistributedCacheEntryOptions Ttl = new() { AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(1) };

    public async Task<StatsDto> GetAsync(int projectId, CancellationToken ct)
    {
        string key = $"stats:v1:{projectId}";
        string? cached = await cache.GetStringAsync(key, ct);
        if (cached is not null)
            return JsonSerializer.Deserialize<StatsDto>(cached)!;

        var stats = await query.CalculateAsync(projectId, ct);          // тяжёлый запрос к БД
        await cache.SetStringAsync(key, JsonSerializer.Serialize(stats), Ttl, ct);
        return stats;
    }

    public Task InvalidateAsync(int projectId, CancellationToken ct) => cache.RemoveAsync($"stats:v1:{projectId}", ct);
}

public interface IProjectStatsQuery { Task<StatsDto> CalculateAsync(int projectId, CancellationToken ct); }
public sealed record StatsDto(int Todo, int InProgress, int Done, int Overdue);
~~~

Строка подключения `ConnectionStrings__Redis` приходит из переменных окружения Compose ([Compose](#p6-compose)). Тот же `IMemoryCache` с декоратором ты уже видел в [паттернах](#p5-patterns); различие в том, где живут данные.

### Шаг 3. Лавина промахов (cache stampede)

Когда популярный ключ истёк, а запросов много, **все** одновременные запросы видят промах и все идут в базу: ровно в тот момент, когда нагрузка и так высока. Проверим это на настоящем Redis: двадцать параллельных запросов к пустому кэшу без защиты и с защитой (замок на ключ внутри процесса: первый идёт в базу, остальные ждут и берут готовое):

~~~csharp
using System.Globalization;
using System.Net.Sockets;
using System.Text;
using System.Collections.Concurrent;

var redis = await Redis.ConnectAsync("127.0.0.1", 6390);
await redis.CallAsync("FLUSHALL");

var dbCalls = 0;
async Task<string> Db() { Interlocked.Increment(ref dbCalls); await Task.Delay(150); return "тяжёлый-результат"; }

async Task<string> Unprotected(string key)
{
    if (await redis.CallAsync("GET", key) is string cached) return cached;
    var value = await Db();
    await redis.CallAsync("SET", key, value, "PX", 5000);
    return value;
}

var locks = new ConcurrentDictionary<string, SemaphoreSlim>();
async Task<string> Protected(string key)
{
    if (await redis.CallAsync("GET", key) is string cached) return cached;
    var gate = locks.GetOrAdd(key, _ => new SemaphoreSlim(1, 1));
    await gate.WaitAsync();
    try
    {
        if (await redis.CallAsync("GET", key) is string again) return again;                           // проверяем второй раз: пока ждали, мог положить другой
        var value = await Db();
        await redis.CallAsync("SET", key, value, "PX", 5000);
        return value;
    }
    finally { gate.Release(); }
}

async Task<int> Burst(Func<string, Task<string>> get, string key)
{
    dbCalls = 0;
    var start = new TaskCompletionSource();
    var tasks = Enumerable.Range(0, 20).Select(async i => { await start.Task; return await get(key); }).ToArray();
    start.SetResult();                                                                                  // стартуем одновременно
    await Task.WhenAll(tasks);
    return dbCalls;
}

var unprotected = await Burst(Unprotected, "stampede:a");
Console.WriteLine($"без защиты: 20 запросов → обращений к базе больше одного: {unprotected > 1}");
var protectedCalls = await Burst(Protected, "stampede:b");
Console.WriteLine($"с замком на ключ: 20 запросов → обращений к базе: {protectedCalls}");
redis.Dispose();

public sealed class Redis : IDisposable
{
    private readonly TcpClient _tcp = new();
    private Stream _out = null!, _in = null!;
    private readonly SemaphoreSlim _gate = new(1, 1);

    public static async Task<Redis> ConnectAsync(string host, int port)
    {
        var r = new Redis();
        using var cts = new CancellationTokenSource(1000);
        await r._tcp.ConnectAsync(host, port, cts.Token);
        r._out = r._tcp.GetStream();
        r._in = new BufferedStream(r._out);
        return r;
    }

    public async Task<object?> CallAsync(params object[] args)
    {
        await _gate.WaitAsync();
        try
        {
            var msg = new MemoryStream();
            void Write(string text) { var b = Encoding.UTF8.GetBytes(text); msg.Write(b, 0, b.Length); }
            Write($"*{args.Length}\r\n");                                                              // массив из N строк
            foreach (var a in args)
            {
                var bytes = Encoding.UTF8.GetBytes(Convert.ToString(a, CultureInfo.InvariantCulture)!);
                Write($"${bytes.Length}\r\n"); msg.Write(bytes, 0, bytes.Length); Write("\r\n");
            }
            await _out.WriteAsync(msg.ToArray());
            return await ReadReplyAsync();
        }
        finally { _gate.Release(); }
    }

    private async Task<int> ReadByteAsync()
    {
        var buf = new byte[1];
        if (await _in.ReadAsync(buf) == 0) throw new IOException("соединение закрыто");
        return buf[0];
    }

    private async Task<string> ReadLineAsync()
    {
        var sb = new StringBuilder();
        while (true)
        {
            var b = await ReadByteAsync();
            if (b == '\r') { await ReadByteAsync(); return sb.ToString(); }
            sb.Append((char)b);
        }
    }

    private async Task<object?> ReadReplyAsync()
    {
        var type = (char)await ReadByteAsync();
        var line = await ReadLineAsync();
        switch (type)
        {
            case '+': return line;                                                                      // простая строка (OK)
            case '-': throw new InvalidOperationException(line);                                        // ошибка
            case ':': return long.Parse(line);                                                          // число
            case '$':                                                                                   // строка с длиной; -1 = null
                var n = int.Parse(line);
                if (n < 0) return null;
                var buf = new byte[n + 2];
                for (int off = 0; off < buf.Length;)
                {
                    var read = await _in.ReadAsync(buf.AsMemory(off));
                    if (read == 0) throw new IOException("соединение закрыто");
                    off += read;
                }
                return Encoding.UTF8.GetString(buf, 0, n);
            default: throw new NotSupportedException($"тип ответа {type}");
        }
    }

    public void Dispose() => _tcp.Dispose();
}
~~~
~~~console
без защиты: 20 запросов → обращений к базе больше одного: True
с замком на ключ: 20 запросов → обращений к базе: 1
~~~

Замок внутри процесса защищает один экземпляр API. Если экземпляров много, каждый сходит в базу по разу: это уже терпимо (не двадцать). Для полной защиты используют распределённый замок или `HybridCache`, который берёт эту заботу на себя. Другие приёмы: добавлять к TTL случайный разброс, чтобы ключи не истекали все сразу; обновлять популярные ключи заранее.

### Шаг 4. Rate limiting — встроен в ASP.NET Core

~~~csharp Program.cs @nocheck
using Microsoft.AspNetCore.RateLimiting;   // AddFixedWindowLimiter, RequireRateLimiting

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddRateLimiter(o =>
{
    o.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    o.AddFixedWindowLimiter("login", l =>
    {
        l.PermitLimit = 5;                         // не больше 5 попыток входа…
        l.Window = TimeSpan.FromMinutes(1);        // …в минуту
        l.QueueLimit = 0;
    });
});

var app = builder.Build();
app.UseRateLimiter();

app.MapPost("/api/auth/login", () => Results.Ok()).RequireRateLimiting("login");
app.Run();
~~~

Защищает вход от подбора паролей и API от случайного «зацикленного» клиента. Шестой запрос в минуту получит `429 Too Many Requests`. Но у этой политики есть ловушка, которую легко не заметить: лимит **общий для всех клиентов**. Один злоумышленник за минуту исчерпает пять попыток, и честные пользователи не смогут войти. В реальном проекте лимит разделяют по ключу (IP или пользователь) через `AddPolicy` с партиционированием. Запустим оба варианта на настоящем сервере:

~~~csharp
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.RateLimiting;

var builder = WebApplication.CreateBuilder();
builder.WebHost.UseUrls("http://127.0.0.1:0");
builder.Logging.ClearProviders();
builder.Services.AddRateLimiter(o =>
{
    o.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    o.OnRejected = (ctx, ct) =>
    {
        if (ctx.Lease.TryGetMetadata(MetadataName.RetryAfter, out var retry))
            ctx.HttpContext.Response.Headers.RetryAfter = ((int)retry.TotalSeconds).ToString();
        return ValueTask.CompletedTask;
    };
    o.AddFixedWindowLimiter("global-login", l => { l.PermitLimit = 5; l.Window = TimeSpan.FromMinutes(1); l.QueueLimit = 0; });
    o.AddPolicy("per-client", ctx => RateLimitPartition.GetFixedWindowLimiter(
        ctx.Request.Headers["X-Client"].ToString(),                                                     // ключ раздела: свой счётчик у каждого клиента
        _ => new FixedWindowRateLimiterOptions { PermitLimit = 5, Window = TimeSpan.FromMinutes(1), QueueLimit = 0 }));
});
var app = builder.Build();
app.UseRateLimiter();
app.MapPost("/global", () => Results.Ok()).RequireRateLimiting("global-login");
app.MapPost("/per-client", () => Results.Ok()).RequireRateLimiting("per-client");
await app.StartAsync();

using var http = new HttpClient { BaseAddress = new Uri(app.Urls.First()) };
async Task<HttpResponseMessage> Post(string url, string client)
{
    var req = new HttpRequestMessage(HttpMethod.Post, url);
    req.Headers.Add("X-Client", client);
    return await http.SendAsync(req);
}

// общий лимит: «злоумышленник» делает 7 попыток…
var codes = new List<int>();
for (int i = 0; i < 7; i++) codes.Add((int)(await Post("/global", "attacker")).StatusCode);
Console.WriteLine($"общий лимит, атакующий:          {string.Join(" ", codes)}");
var honest = await Post("/global", "honest-user");
Console.WriteLine($"общий лимит, честный пользователь: {(int)honest.StatusCode}  ← тоже заблокирован");
Console.WriteLine($"в ответе есть Retry-After:        {(await Post("/global", "x")).Headers.Contains("Retry-After")}");

// лимит по клиенту
codes.Clear();
for (int i = 0; i < 7; i++) codes.Add((int)(await Post("/per-client", "attacker")).StatusCode);
Console.WriteLine($"по клиентам, атакующий:          {string.Join(" ", codes)}");
Console.WriteLine($"по клиентам, честный пользователь: {(int)(await Post("/per-client", "honest-user")).StatusCode}  ← не пострадал");
await app.StopAsync();
~~~
~~~console
общий лимит, атакующий:          200 200 200 200 200 429 429
общий лимит, честный пользователь: 429  ← тоже заблокирован
в ответе есть Retry-After:        True
по клиентам, атакующий:          200 200 200 200 200 429 429
по клиентам, честный пользователь: 200  ← не пострадал
~~~

Выбор ключа раздела — вся суть: IP-адрес за обратным прокси без `UseForwardedHeaders` у всех одинаковый ([деплой](#p6-deploy)), а один пользователь с разных IP обходит лимит по IP; поэтому для входа часто комбинируют адрес и имя пользователя. Алгоритмы бывают разные: фиксированное окно (простое, но возможен всплеск на стыке окон), скользящее окно, token bucket (позволяет короткие всплески), concurrency (ограничивает число одновременных запросов). Покажем стык окон на модели с управляемым временем: пять запросов в самом конце окна и пять в начале следующего:

~~~csharp
var clock = new ManualTime(new DateTimeOffset(2026, 1, 1, 12, 0, 0, TimeSpan.Zero));
var fixedWindow = new FixedWindow(limit: 5, windowSeconds: 60, clock);
var sliding = new SlidingLog(limit: 5, windowSeconds: 60, clock);

int Allowed(Func<bool> tryAcquire, int attempts) => Enumerable.Range(0, attempts).Count(_ => tryAcquire());

clock.Set(second: 58);                                                                                  // конец первого окна
var a1 = Allowed(fixedWindow.TryAcquire, 5); var b1 = Allowed(sliding.TryAcquire, 5);
clock.Set(second: 62);                                                                                  // начало следующего окна
var a2 = Allowed(fixedWindow.TryAcquire, 5); var b2 = Allowed(sliding.TryAcquire, 5);
Console.WriteLine($"фиксированное окно: пропущено {a1} + {a2} = {a1 + a2} запросов за 4 секунды (лимит 5 в минуту)");
Console.WriteLine($"скользящее окно:    пропущено {b1} + {b2} = {b1 + b2} запросов за 4 секунды");

public sealed class ManualTime(DateTimeOffset start)
{
    private DateTimeOffset _now = start;
    public DateTimeOffset Now => _now;
    public void Set(int second) => _now = new DateTimeOffset(start.Year, start.Month, start.Day, start.Hour, 0, 0, TimeSpan.Zero).AddSeconds(second);
}

public sealed class FixedWindow(int limit, int windowSeconds, ManualTime clock)
{
    private long _window = -1; private int _count;
    public bool TryAcquire()
    {
        var w = clock.Now.ToUnixTimeSeconds() / windowSeconds;
        if (w != _window) { _window = w; _count = 0; }                                                  // новое окно — счётчик с нуля
        return ++_count <= limit;
    }
}

public sealed class SlidingLog(int limit, int windowSeconds, ManualTime clock)
{
    private readonly Queue<DateTimeOffset> _log = new();
    public bool TryAcquire()
    {
        while (_log.Count > 0 && clock.Now - _log.Peek() >= TimeSpan.FromSeconds(windowSeconds)) _log.Dequeue();
        if (_log.Count >= limit) return false;
        _log.Enqueue(clock.Now); return true;
    }
}
~~~
~~~console
фиксированное окно: пропущено 5 + 5 = 10 запросов за 4 секунды (лимит 5 в минуту)
скользящее окно:    пропущено 5 + 0 = 5 запросов за 4 секунды
~~~

Фиксированное окно пропустило десять запросов за четыре секунды: на границе окон лимит «удвоился». Скользящее окно точнее, но хранит больше информации. Это модель, а не код ASP.NET Core, но она объясняет, зачем существуют разные алгоритмы.

### Шаг 5. Лимит при нескольких экземплярах: счётчик в Redis

Встроенный ограничитель живёт в памяти процесса. Если у тебя три экземпляра API за балансировщиком, у каждого свой счётчик, и реальный лимит клиента становится втрое выше. Общий счётчик можно вести в Redis командой `INCR` (атомарное увеличение) и сроком `EXPIRE`. Проверим на настоящем Redis с тремя «экземплярами»:

~~~csharp
using System.Globalization;
using System.Net.Sockets;
using System.Text;
var redis = await Redis.ConnectAsync("127.0.0.1", 6390);
await redis.CallAsync("FLUSHALL");

// локальные счётчики: у каждого экземпляра свой
var local = new int[3];
int Local(int instance) => ++local[instance] <= 5 ? 1 : 0;

// общий счётчик в Redis
async Task<bool> Shared(string client)
{
    var key = $"rl:{client}";
    var count = (long)(await redis.CallAsync("INCR", key))!;                                            // атомарно, даже при гонке экземпляров
    if (count == 1) await redis.CallAsync("EXPIRE", key, 60);                                           // окно начинается с первого запроса
    return count <= 5;
}

var localAllowed = 0; var sharedAllowed = 0;
for (int i = 0; i < 12; i++)                                                                            // 12 запросов клиента разлетаются по экземплярам по кругу
{
    localAllowed += Local(i % 3);
    if (await Shared("client-1")) sharedAllowed++;
}
Console.WriteLine($"лимит 5/мин, 3 экземпляра: локальные счётчики пропустили {localAllowed}, общий счётчик Redis — {sharedAllowed}");
var ttl = (long)(await redis.CallAsync("TTL", "rl:client-1"))!;
Console.WriteLine($"у счётчика есть срок жизни: {ttl is > 0 and <= 60}");
redis.Dispose();

public sealed class Redis : IDisposable
{
    private readonly TcpClient _tcp = new();
    private Stream _out = null!, _in = null!;
    private readonly SemaphoreSlim _gate = new(1, 1);

    public static async Task<Redis> ConnectAsync(string host, int port)
    {
        var r = new Redis();
        using var cts = new CancellationTokenSource(1000);
        await r._tcp.ConnectAsync(host, port, cts.Token);
        r._out = r._tcp.GetStream();
        r._in = new BufferedStream(r._out);
        return r;
    }

    public async Task<object?> CallAsync(params object[] args)
    {
        await _gate.WaitAsync();
        try
        {
            var msg = new MemoryStream();
            void Write(string text) { var b = Encoding.UTF8.GetBytes(text); msg.Write(b, 0, b.Length); }
            Write($"*{args.Length}\r\n");                                                              // массив из N строк
            foreach (var a in args)
            {
                var bytes = Encoding.UTF8.GetBytes(Convert.ToString(a, CultureInfo.InvariantCulture)!);
                Write($"${bytes.Length}\r\n"); msg.Write(bytes, 0, bytes.Length); Write("\r\n");
            }
            await _out.WriteAsync(msg.ToArray());
            return await ReadReplyAsync();
        }
        finally { _gate.Release(); }
    }

    private async Task<int> ReadByteAsync()
    {
        var buf = new byte[1];
        if (await _in.ReadAsync(buf) == 0) throw new IOException("соединение закрыто");
        return buf[0];
    }

    private async Task<string> ReadLineAsync()
    {
        var sb = new StringBuilder();
        while (true)
        {
            var b = await ReadByteAsync();
            if (b == '\r') { await ReadByteAsync(); return sb.ToString(); }
            sb.Append((char)b);
        }
    }

    private async Task<object?> ReadReplyAsync()
    {
        var type = (char)await ReadByteAsync();
        var line = await ReadLineAsync();
        switch (type)
        {
            case '+': return line;                                                                      // простая строка (OK)
            case '-': throw new InvalidOperationException(line);                                        // ошибка
            case ':': return long.Parse(line);                                                          // число
            case '$':                                                                                   // строка с длиной; -1 = null
                var n = int.Parse(line);
                if (n < 0) return null;
                var buf = new byte[n + 2];
                for (int off = 0; off < buf.Length;)
                {
                    var read = await _in.ReadAsync(buf.AsMemory(off));
                    if (read == 0) throw new IOException("соединение закрыто");
                    off += read;
                }
                return Encoding.UTF8.GetString(buf, 0, n);
            default: throw new NotSupportedException($"тип ответа {type}");
        }
    }

    public void Dispose() => _tcp.Dispose();
}
~~~
~~~console
лимит 5/мин, 3 экземпляра: локальные счётчики пропустили 12, общий счётчик Redis — 5
у счётчика есть срок жизни: True
~~~

Два замечания. Связка `INCR` + `EXPIRE` не атомарна: если процесс упадёт между ними, ключ останется без срока и клиент будет заблокирован навсегда; в боевом коде это делают одним скриптом Lua или транзакцией. И снова: если Redis недоступен, решай заранее, что делать — пропускать все запросы (рискуя перегрузкой) или блокировать все (рискуя недоступностью).

### Шаг 6. Устойчивость при вызове внешних сервисов

~~~bash
dotnet add package Microsoft.Extensions.Http.Resilience
~~~

~~~csharp @nocheck
builder.Services.AddHttpClient<WeatherClient>(c => c.BaseAddress = new Uri("https://api.example.com/"))
    .AddStandardResilienceHandler();      // повторы с паузами, таймауты, circuit breaker — разумные настройки по умолчанию
~~~

- `HttpClient` создавай через `IHttpClientFactory` (`AddHttpClient`), а не `new HttpClient()` на каждый вызов — иначе исчерпание сокетов и устаревший DNS.
- Повторять можно только **идемпотентные** операции (помнишь [REST](#p4-http)?) — иначе повтор `POST` создаст дубль.

Покажем, чем кончается повтор неидемпотентного запроса. Сервер создаёт заказ, но соединение обрывается до отправки ответа; клиент не знает, что заказ создан, и повторяет запрос. Потом то же самое, но с ключом идемпотентности:

~~~csharp
var orders = new List<string>();
var seenKeys = new Dictionary<string, string>();
var failNext = true;                                                                                    // первый ответ «теряется»

var builder = WebApplication.CreateBuilder();
builder.WebHost.UseUrls("http://127.0.0.1:0");
builder.Logging.ClearProviders();
var app = builder.Build();
app.MapPost("/orders", (HttpContext ctx) =>
{
    var key = ctx.Request.Headers["Idempotency-Key"].ToString();
    if (key != "" && seenKeys.TryGetValue(key, out var existing)) return Results.Ok(existing);        // повтор: отдаём прежний результат
    var id = $"order-{orders.Count + 1}";
    orders.Add(id);                                                                                     // заказ СОЗДАН
    if (key != "") seenKeys[key] = id;
    if (failNext) { failNext = false; ctx.Abort(); return Results.Empty; }                              // …но ответ не дошёл
    return Results.Ok(id);
});
await app.StartAsync();
using var http = new HttpClient { BaseAddress = new Uri(app.Urls.First()) };

async Task<string> PostWithRetry(string? key)
{
    for (int attempt = 1; ; attempt++)
    {
        try
        {
            var req = new HttpRequestMessage(HttpMethod.Post, "/orders");
            if (key is not null) req.Headers.Add("Idempotency-Key", key);
            var r = await http.SendAsync(req);
            return await r.Content.ReadAsStringAsync();
        }
        catch (HttpRequestException) when (attempt < 3) { await Task.Delay(20 * attempt); }             // линейная пауза между повторами
    }
}

await PostWithRetry(null);
Console.WriteLine($"без ключа идемпотентности: заказов создано {orders.Count}");
orders.Clear(); failNext = true;
await PostWithRetry("req-42");
Console.WriteLine($"с ключом идемпотентности:   заказов создано {orders.Count}");
await app.StopAsync();
~~~
~~~console
без ключа идемпотентности: заказов создано 2
с ключом идемпотентности:   заказов создано 1
~~~

Без ключа повтор создал **два** заказа (клиент заплатил дважды), с ключом — один. Поэтому в платёжных API есть заголовок `Idempotency-Key`: клиент генерирует уникальное значение на каждую *логическую* операцию и присылает одно и то же при повторах. На сервере ключ хранят с результатом (в базе или Redis) на ограниченный срок. В демонстрации словарь живёт в памяти ради простоты; в проекте это таблица или Redis.

Как повторять правильно: ограничить число попыток; делать паузу, растущую по экспоненте, с **джиттером** (случайным разбросом, чтобы все клиенты не ломились одновременно); не повторять ошибки клиента (`4xx`); задать таймаут на каждую попытку и общий. Circuit breaker «размыкает цепь» после серии сбоев: некоторое время запросы сразу отклоняются, давая сервису восстановиться, а потом цепь пробно замыкается. `AddStandardResilienceHandler` настраивает такой набор по умолчанию (по документации пакета).

## Как это работает под капотом

- **Redis — хранилище «ключ → значение» в памяти.** Один поток исполняет команды по очереди, поэтому каждая команда (`INCR`, `SET`) атомарна. Последовательность из двух команд (`INCR`, затем `EXPIRE`) атомарной уже не является.
- **Протокол RESP.** Команда — массив строк с префиксами длины; ответ — один из типов (`+` строка, `-` ошибка, `:` число, `$` строка с длиной, `*` массив). Мы реализовали это в нашем клиенте; библиотека `StackExchange.Redis` делает то же, плюс пулы соединений, конвейеризацию и переподключение.
- **TTL.** Redis хранит время истечения вместе с ключом. Просроченный ключ удаляется лениво при обращении и фоновым выборочным обходом, поэтому память освобождается не мгновенно.
- **Вытеснение.** При нехватке памяти политика `maxmemory-policy` решает, что удалять. Если Redis используется *только* как кэш, подойдёт вытеснение наименее используемых ключей; если в нём лежат ещё и важные данные, такая политика опасна.
- **Сохранность.** По умолчанию Redis не гарантирует сохранность каждой записи после сбоя: это кэш, а не база. Для счётчиков идемпотентности или очередей настраивают персистентность или берут другое хранилище.
- **`IDistributedCache`** хранит строки и байты, поэтому объекты сериализуют (обычно в JSON); `IMemoryCache` хранит сами объекты, и их изменение по ссылке видно всем читателям (ловушка из [паттернов](#p5-patterns)).
- **Лавина и замки.** Замок на ключ внутри процесса исключает дубли работы в одном экземпляре. Между экземплярами нужен распределённый замок или терпимость к нескольким одновременным расчётам.
- **Rate limiting в ASP.NET Core.** Middleware вычисляет раздел по политике, пытается получить «разрешение» у ограничителя этого раздела и при отказе отвечает кодом `429`, вызывая `OnRejected`. Счётчики живут в памяти процесса, поэтому перезапуск сбрасывает их, а несколько экземпляров считают отдельно.
- **Идемпотентность.** HTTP-методы `GET`, `PUT`, `DELETE` по определению идемпотентны (повтор не меняет итоговое состояние), `POST` нет. Ключ идемпотентности делает неидемпотентный запрос безопасным для повтора.

## Типичные ошибки и ловушки

- **Кэш без стратегии инвалидации и TTL.** Данные устаревают навсегда, а ошибка плавающая и трудно воспроизводимая.
- **Кэш как источник истины.** Ключ исчез — данные потеряны. Правда всегда в базе.
- **Падение приложения при недоступном кэше.** Оборачивай обращения к Redis и иди в базу, оставив короткий таймаут на подключение.
- **Лавина промахов.** Одновременные промахи по популярному ключу кладут базу; нужен замок, разброс TTL или `HybridCache`.
- **Ключи без версии и без пространства имён.** Смена формата данных ломает старые записи; общие имена ключей конфликтуют.
- **Кэширование персональных данных под общим ключом.** Пользователь видит чужие данные. Включай идентификатор пользователя в ключ.
- **Мутация объекта из `IMemoryCache` по ссылке.** Меняется кэшированное значение для всех.
- **Общий лимит на всех клиентов** (один злоумышленник блокирует всех) и лимит по IP за прокси без заголовков пересылки.
- **Несколько экземпляров с локальными счётчиками.** Реальный лимит выше задуманного в N раз.
- **`INCR` без срока жизни или не атомарная пара `INCR` + `EXPIRE`.** Клиент блокируется навсегда.
- **Повтор неидемпотентных запросов.** Дубли заказов и платежей; нужны ключи идемпотентности.
- **Повторы без пауз и без предела.** Ты сам становишься источником перегрузки для упавшего сервиса («шторм повторов»).
- **`new HttpClient()` на каждый вызов.** Исчерпание сокетов и устаревший DNS; используй `IHttpClientFactory`.
- **Кэш «на всякий случай» без измерений.** Усложнение без доказанной пользы; сначала измерь запрос, потом кэшируй и измерь снова.

## Вопросы с собеседований

:::spoiler Что такое cache-aside?
Приложение само управляет кэшем: при чтении сначала смотрит в кэш, при промахе читает из БД и кладёт в кэш; при изменении пишет в БД и удаляет ключ из кэша.
:::

:::spoiler Почему IMemoryCache плохо работает при нескольких экземплярах API?
У каждого экземпляра свой кэш: после изменения данных один экземпляр инвалидирует свой кэш, а другие продолжают отдавать устаревшие данные. Общий распределённый кэш решает это.
:::

:::spoiler Что такое cache stampede и как с ним бороться?
Одновременные промахи по одному ключу вызывают одновременные тяжёлые обращения к базе. Решения: замок на ключ (один считает, остальные ждут), случайный разброс TTL, предварительное обновление, `HybridCache`.
:::

:::spoiler Что будет, если Redis упадёт? (ловушка: «приложение остановится»)
Кэш — оптимизация: приложение должно перейти на чтение из базы (медленнее) с коротким таймаутом на обращение к кэшу. Если в Redis хранятся важные данные (счётчики, ключи идемпотентности), нужно заранее решить, что делать при его недоступности.
:::

:::spoiler Чем фиксированное окно отличается от скользящего в rate limiting?
Фиксированное считает запросы в окнах, выровненных по часам, и на стыке окон пропускает до двойного лимита. Скользящее считает за последние N секунд и точнее, но дороже. Token bucket допускает короткие всплески при заданной средней скорости.
:::

:::spoiler Почему встроенный rate limiter не защищает при нескольких экземплярах?
Его счётчики лежат в памяти процесса: у каждого экземпляра свой. Нужен общий счётчик (например, в Redis) или ограничение на уровне балансировщика/шлюза.
:::

:::spoiler Почему нельзя автоматически повторять любой неудавшийся запрос?
Неидемпотентный запрос (например, создание заказа) мог успеть выполниться на сервере, а сбой случился при получении ответа. Повтор создаст дубль. Повторяют только безопасные/идемпотентные операции или используют ключи идемпотентности.
:::

:::spoiler Что такое circuit breaker и зачем он нужен?
Предохранитель: после серии сбоев вызовы к сервису сразу отклоняются на время, чтобы не нагружать упавшую зависимость и быстро отвечать клиентам, затем пробный запрос проверяет восстановление.
:::

## Что запомнить

- Cache-aside: чтение — кэш, при промахе база и запись в кэш с TTL; изменение — запись в базу и удаление ключа.
- Кэш обменивает свежесть на скорость: продумай TTL, инвалидацию и поведение при недоступном кэше. Правда живёт в базе.
- `IMemoryCache` локален для процесса, Redis общий; ключи версионируй и включай в них пользователя, если данные личные.
- Лавина промахов лечится замком на ключ, разбросом TTL или `HybridCache`.
- Rate limiting: выбери ключ раздела (клиент, не все сразу) и алгоритм; при нескольких экземплярах счётчик должен быть общим, а `INCR` + `EXPIRE` делай атомарно.
- Повторяй только идемпотентные операции или добавляй `Idempotency-Key`; повторы с экспоненциальной паузой, джиттером и пределом; circuit breaker защищает упавший сервис.
- `HttpClient` — через `IHttpClientFactory`.
- Здесь проверено на настоящих Redis 7 и ASP.NET Core; NuGet-пакеты (StackExchange.Redis, HybridCache, Resilience) не запускались и описаны по документации.

## Практика

- [ ] Добавил Redis-кэш для одного тяжёлого запроса капстоуна с TTL и инвалидацией; замерил время до и после
- [ ] Проверил поведение при остановленном Redis (`docker compose stop redis`) и сделал так, чтобы API не падал
- [ ] Ограничил частоту входа и проверил 429
- [ ] Вызов внешнего API (если есть) — через `IHttpClientFactory` с resilience handler

