@@page id="p3-efcore" phase="3" kind="topic" title="EF Core: DbContext, Code First, подключение к PostgreSQL" nav="EF Core: DbContext" est="~1 неделя"
:::why
EF Core — стандартный ORM в .NET: в большинстве вакансий junior .NET он в требованиях. Задача — **понимать**, а не просто вызывать методы: что такое `DbContext`, как классы превращаются в таблицы и какой SQL уходит в базу на каждую строчку LINQ.
:::

## Зачем это нужно

Ты уже умеешь писать SQL и понимаешь LINQ. EF Core — клей между ними: он позволяет работать с базой данных на C# — объектами, типами и LINQ-запросами, — а SQL, `INSERT`/`UPDATE`, соединения и чтение результатов берёт на себя.

Что это даёт на практике:

- **Скорость разработки.** Не нужно вручную писать десятки одинаковых `SELECT`/`INSERT` и разбирать `DataReader`; модель описывается один раз классами.
- **Типобезопасность.** Опечатка в имени свойства — ошибка компиляции, а не падение на проде. Переименование свойства в IDE обновляет все запросы.
- **Единая схема.** Миграции хранят историю изменений схемы в git вместе с кодом.
- **Защита от SQL-инъекций.** Значения в запросах всегда передаются параметрами.

А вот почему важно «понимать, а не вызывать»:

- **ORM — не волшебство.** Каждая строчка LINQ превращается в SQL, и неудачная формулировка даёт тысячу запросов вместо одного (тема [N+1](#p3-loading)).
- **Собеседование.** «Что такое `DbContext`? В чём разница между `DbSet` и `IQueryable`? Что такое Code First? Какие подходы к конфигурации?» — вопросы почти обязательные.
- **Вакансии.** EF Core упомянут в большинстве описаний Junior .NET, ASP.NET Core почти всегда идёт в связке с ним.
- **Диагностика.** Ты должен уметь включить лог SQL, прочитать его и сказать, почему запрос медленный.

## Интуиция и аналогия

**Переводчик между двумя языками.** Ты говоришь по-C#: «дай книги жанра “Роман” новее 1900 года». База данных понимает только SQL. EF Core — переводчик-синхронист: он выслушивает LINQ-запрос, переводит его на SQL, отправляет, получает таблицу строк и **переводит ответ обратно** — в объекты `Book`. Если фраза непереводима (твой собственный C#-метод внутри условия), переводчик честно скажет «не могу перевести».

**DbContext — рабочая сессия у стойки архива.** Ты приходишь с заявкой, получаешь папки (сущности), вносишь правки в черновик, а в конце говоришь «сохраните» (`SaveChanges`). Архивариус запоминает, какие папки он тебе выдал и что в них было изначально, чтобы понять, что ты изменил. Сессия короткая: ты не занимаешь стойку на весь день.

**Code First — чертёж, из которого строят дом.** Источник правды — классы C#; схема базы создаётся и меняется по ним (через миграции). Противоположность — Database First, когда схема уже есть, а классы генерируют по ней.

## Основная теория по шагам

### Шаг 1. Что такое ORM

ORM (Object-Relational Mapper) связывает объекты C# и строки таблиц: ты пишешь LINQ к `DbSet<Book>`, а EF Core переводит его в SQL (помнишь [IQueryable](#p2-linq/iqueryable)?), выполняет и превращает строки результата обратно в объекты. Плюс отслеживает изменения объектов и при `SaveChanges()` генерирует `INSERT`/`UPDATE`/`DELETE`.

Идею «перевода» можно потрогать руками без всякой базы. Вот игрушечный переводчик условия `Where` в SQL — он обходит дерево выражений (то самое, из которого строится `Expression<Func<T, bool>>`). Настоящий EF Core делает то же самое, только для сотен конструкций:

~~~csharp
using System.Linq.Expressions;

int minYear = 1900;                                                       // захваченная переменная
Expression<Func<Book, bool>> ok = b => b.Genre == "Роман" && b.Year > minYear;
var parameters = new List<object?>();
Console.WriteLine("WHERE " + ToSql(ok.Body, parameters));
Console.WriteLine("параметры: " + string.Join(", ", parameters));

try
{
    Expression<Func<Book, bool>> bad = b => Rules.IsRare(b);            // свой C#-метод
    ToSql(bad.Body, parameters);
}
catch (NotSupportedException ex) { Console.WriteLine("не удалось перевести: " + ex.Message); }

static string ToSql(Expression e, List<object?> ps) => e switch
{
    BinaryExpression { NodeType: ExpressionType.AndAlso } x => $"{ToSql(x.Left, ps)} AND {ToSql(x.Right, ps)}",
    BinaryExpression { NodeType: ExpressionType.OrElse } x  => $"({ToSql(x.Left, ps)} OR {ToSql(x.Right, ps)})",
    BinaryExpression x => $"{ToSql(x.Left, ps)} {Op(x.NodeType)} {ToSql(x.Right, ps)}",
    MemberExpression { Expression: ParameterExpression, Member.Name: var n } => $"b.\"{n}\"",
    MemberExpression m => Param(Expression.Lambda(m).Compile().DynamicInvoke(), ps),   // значение из замыкания
    ConstantExpression c => Param(c.Value, ps),
    _ => throw new NotSupportedException($"выражение «{e}» не имеет аналога в SQL")
};

static string Param(object? value, List<object?> ps) { ps.Add(value); return "@p" + (ps.Count - 1); }
static string Op(ExpressionType t) => t switch
{
    ExpressionType.Equal => "=", ExpressionType.NotEqual => "<>", ExpressionType.GreaterThan => ">",
    ExpressionType.GreaterThanOrEqual => ">=", ExpressionType.LessThan => "<", ExpressionType.LessThanOrEqual => "<=",
    _ => throw new NotSupportedException(t.ToString())
};

record Book(string Genre, int Year, int Copies);

static class Rules { public static bool IsRare(Book b) => b.Copies == 1; }
~~~
~~~console
WHERE b."Genre" = @p0 AND b."Year" > @p1
параметры: Роман, 1900
не удалось перевести: выражение «IsRare(b)» не имеет аналога в SQL
~~~

Обрати внимание на три вещи: значения (`'Роман'`, `1900`) превращаются в **параметры** `@p0`, `@p1` — именно так EF защищается от SQL-инъекций; захваченная переменная `minYear` вычисляется и тоже становится параметром; а вызов своего метода `IsRare` переводчик не понимает. Реальный EF Core на такое отвечает исключением `InvalidOperationException: The LINQ expression could not be translated`.

### Шаг 2. Установка

~~~bash
dotnet new console -n LibraryEf
cd LibraryEf
dotnet add package Npgsql.EntityFrameworkCore.PostgreSQL     # провайдер PostgreSQL
dotnet add package Microsoft.EntityFrameworkCore.Design       # нужен для миграций
dotnet tool install --global dotnet-ef                        # CLI: dotnet ef ...
~~~

Пакет `Npgsql.EntityFrameworkCore.PostgreSQL` тянет за собой `Microsoft.EntityFrameworkCore`; версии основного пакета и провайдера должны совпадать по мажорной версии с твоей платформой (для .NET 10 — EF Core 10). `dotnet-ef` — отдельный инструмент командной строки для миграций.

### Шаг 3. Модель (Code First)

В подходе **Code First** источник правды — классы C#. Схему базы EF Core создаёт по ним через [миграции](#p3-migrations).

~~~csharp Entities.cs @nocheck
public class Book
{
    public int Id { get; set; }                       // по соглашению — первичный ключ
    public string Isbn { get; set; } = "";
    public string Title { get; set; } = "";
    public string Genre { get; set; } = "";
    public int Year { get; set; }
    public int Copies { get; set; }

    public List<Author> Authors { get; } = new();     // многие-ко-многим
    public List<Loan> Loans { get; } = new();         // один-ко-многим
}

public class Author
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public List<Book> Books { get; } = new();
}

public enum ReaderType { Student, Teacher, External }

public class Reader
{
    public int Id { get; set; }
    public string FullName { get; set; } = "";
    public string CardNumber { get; set; } = "";
    public ReaderType Type { get; set; }
    public List<Loan> Loans { get; } = new();
}

public class Loan
{
    public int Id { get; set; }
    public int BookId { get; set; }                   // внешний ключ
    public Book Book { get; set; } = null!;           // навигация
    public int ReaderId { get; set; }
    public Reader Reader { get; set; } = null!;
    public DateOnly LoanedAt { get; set; }
    public DateOnly DueAt { get; set; }
    public DateOnly? ReturnedAt { get; set; }         // nullable → столбец допускает NULL
}
~~~

`= null!` у навигаций — сигнал компилятору: «EF заполнит это свойство при загрузке связанных данных». Без `Include` навигация может остаться `null` — об этом в [загрузке данных](#p3-loading).

Правила соответствия, которые стоит запомнить:

| C# | Столбец в PostgreSQL |
|---|---|
| `int Id` | первичный ключ, `integer GENERATED BY DEFAULT AS IDENTITY` |
| `string` | `text` (или `varchar(n)`, если указан `HasMaxLength`); `NOT NULL`, если включены nullable-ссылки и тип не `string?` |
| `string?`, `DateOnly?`, `int?` | столбец допускает `NULL` |
| `DateOnly` | `date` |
| enum | число (по умолчанию) или строка (с `HasConversion<string>()`) |
| `decimal` | `numeric(18,2)` по умолчанию — **задай точность явно** |
| навигация `Book` + свойство `BookId` | внешний ключ |

### Шаг 4. DbContext

~~~csharp LibraryContext.cs @nocheck
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

public class LibraryContext : DbContext
{
    public DbSet<Book> Books => Set<Book>();
    public DbSet<Author> Authors => Set<Author>();
    public DbSet<Reader> Readers => Set<Reader>();
    public DbSet<Loan> Loans => Set<Loan>();

    protected override void OnConfiguring(DbContextOptionsBuilder options) =>
        options
            .UseNpgsql("Host=localhost;Port=5432;Database=library_ef;Username=postgres;Password=dev")
            .LogTo(Console.WriteLine, LogLevel.Information)   // печатать SQL в консоль
            .EnableSensitiveDataLogging();                    // показывать значения параметров (только для разработки!)

    protected override void OnModelCreating(ModelBuilder model)
    {
        model.Entity<Book>(b =>
        {
            b.Property(x => x.Isbn).HasMaxLength(20);
            b.HasIndex(x => x.Isbn).IsUnique();
            b.Property(x => x.Title).HasMaxLength(300);
            b.ToTable(t => t.HasCheckConstraint("CK_Books_Copies", "\"Copies\" >= 0"));
        });

        model.Entity<Reader>(r =>
        {
            r.HasIndex(x => x.CardNumber).IsUnique();
            r.Property(x => x.Type).HasConversion<string>();      // хранить enum строкой
        });

        model.Entity<Loan>()
            .HasOne(l => l.Reader)
            .WithMany(r => r.Loans)
            .HasForeignKey(l => l.ReaderId)
            .OnDelete(DeleteBehavior.Restrict);                   // нельзя удалить читателя с выдачами
    }
}
~~~

- `DbContext` — **сессия работы с базой**: соединение, LINQ-запросы, отслеживание изменений, `SaveChanges`. Он лёгкий и короткоживущий: создаётся на одну операцию (в ASP.NET Core — на один HTTP-запрос) и не потокобезопасен.
- `DbSet<T>` — «таблица» как `IQueryable<T>`.
- Конфигурация: **соглашения** (свойство `Id` → PK, `BookId` + навигация `Book` → FK) → **атрибуты** (`[MaxLength]`) → **Fluent API** в `OnModelCreating` (приоритет у него). Fluent API держит модель чистой от инфраструктуры.

:::warn Строка подключения в коде
Здесь — для учебной консоли. В Фазе 4 она переедет в конфигурацию и user secrets, а `DbContext` будет создаваться через DI. Пароли в git не коммитим.
:::

Схема, которую по этой модели построит первая миграция (так выглядят таблицы в PostgreSQL; имена идентификаторов — как в C#, поэтому в SQL они в кавычках). Мы выполним её на настоящем PostgreSQL и дальше проверяем на ней SQL-запросы страницы:

~~~sql Таблицы по модели (сокращённо)
SELECT table_name, string_agg(column_name || ' ' || data_type, ', ' ORDER BY ordinal_position) AS columns
FROM information_schema.columns
WHERE table_schema = 'public'
GROUP BY table_name
ORDER BY table_name;
~~~
~~~console
 table_name |                                                columns                                                
------------+-------------------------------------------------------------------------------------------------------
 AuthorBook | AuthorsId integer, BooksId integer
 Authors    | Id integer, Name text
 Books      | Id integer, Isbn character varying, Title character varying, Genre text, Year integer, Copies integer
 Loans      | Id integer, BookId integer, ReaderId integer, LoanedAt date, DueAt date, ReturnedAt date
 Readers    | Id integer, FullName text, CardNumber text, Type text
(5 rows)
~~~

### Шаг 5. Первые запросы и SQL, который уходит в базу

~~~csharp Program.cs @nocheck
using Microsoft.EntityFrameworkCore;

using var db = new LibraryContext();

var bulgakov = new Author { Name = "Булгаков" };
db.Books.Add(new Book { Isbn = "978-5-01", Title = "Мастер и Маргарита", Genre = "Роман", Year = 1967, Copies = 3, Authors = { bulgakov } });
db.SaveChanges();                                    // INSERT в Authors, Books и таблицу связи

var novels = db.Books
    .Where(b => b.Genre == "Роман" && b.Year > 1900)
    .OrderBy(b => b.Title)
    .Select(b => new { b.Title, b.Year })
    .ToList();                                       // здесь SQL уходит в базу

foreach (var n in novels) Console.WriteLine($"{n.Title} ({n.Year})");
~~~

В логе увидишь примерно такой SQL (его же можно получить без выполнения методом `ToQueryString()`). Выполним его на нашей базе:

~~~sql
SELECT b."Title", b."Year"
FROM "Books" AS b
WHERE b."Genre" = 'Роман' AND b."Year" > 1900
ORDER BY b."Title";
~~~
~~~console
       Title        | Year 
--------------------+------
 Двенадцать стульев | 1928
 Мастер и Маргарита | 1967
(2 rows)
~~~

`Where`, `OrderBy`, `Select` перевелись в SQL — в память пришли только два столбца нужных строк. **Привычка на всю фазу: держи логирование SQL включённым и читай каждый запрос.**

Сравни с запросом без `Select`: загружаются **все** столбцы и создаются отслеживаемые сущности — больше данных по сети и памяти:

~~~sql
SELECT b."Id", b."Copies", b."Genre", b."Isbn", b."Title", b."Year"
FROM "Books" AS b
WHERE b."Genre" = 'Роман' AND b."Year" > 1900
ORDER BY b."Title";
~~~
~~~console
 Id | Copies | Genre |   Isbn   |       Title        | Year 
----+--------+-------+----------+--------------------+------
  6 |      2 | Роман | 978-5-06 | Двенадцать стульев | 1928
  1 |      3 | Роман | 978-5-01 | Мастер и Маргарита | 1967
(2 rows)
~~~

:::tip Имена в snake_case
Npgsql по умолчанию создаёт таблицы и столбцы с именами как в C# (`"Books"`, `"Title"`) — в SQL их приходится брать в кавычки. Пакет `EFCore.NamingConventions` и `.UseSnakeCaseNamingConvention()` делают имена `books`, `title`. Решение на вкус команды, главное — одно на проект.
:::

:::info Синхронно или асинхронно
У всех методов есть асинхронные версии: `ToListAsync`, `SaveChangesAsync`, `FirstOrDefaultAsync`. В консольной Фазе 3 можно писать синхронно; с Фазы 4 (ASP.NET Core) — только асинхронно. Что такое `await` на самом деле — Фаза 5.
:::

### Шаг 6. Как EF строит модель: соглашения, атрибуты, Fluent API

Для каждого типа в `DbSet` EF проходит по свойствам и применяет **соглашения**: `Id` или `<ИмяТипа>Id` — первичный ключ; `int`-ключ — identity; свойство `BookId` вместе с навигацией `Book` — внешний ключ; `string` без `?` — `NOT NULL` (при включённых nullable-ссылках). Если соглашений не хватает, используешь:

- **атрибуты** на классе (`[Required]`, `[MaxLength(300)]`, `[Index(nameof(Isbn), IsUnique = true)]`) — коротко, но «замусоривает» сущность;
- **Fluent API** в `OnModelCreating` — самый мощный способ; держит сущности чистыми. Когда конфигурации много, выносят её в классы `IEntityTypeConfiguration<T>` и подключают `ApplyConfigurationsFromAssembly`.

Приоритет: Fluent API → атрибуты → соглашения.

### Шаг 7. Получение результата: когда выполняется запрос

Запрос к `DbSet` — это `IQueryable<T>`, он только **описывает** запрос (как [отложенное выполнение](#p2-iterators) в LINQ). SQL уходит в базу при материализации:

- `ToList()`, `ToArray()`, `First()`, `Single()`, `Count()`, `Any()`, `Sum()` — выполняют запрос;
- `foreach` по запросу — выполняет (и держит соединение открытым на время перебора);
- `Find(id)` — сначала ищет в отслеживаемых сущностях контекста, и только потом идёт в базу;
- методы вроде `Where`, `OrderBy`, `Select`, `Include` — только достраивают запрос.

Метод `ToQueryString()` показывает SQL, не выполняя его — очень удобно для диагностики.

## Как это работает под капотом

- **Конвейер запроса.** LINQ-выражение → дерево выражений → *нормализация* (EF переписывает его) → *перевод* в SQL-дерево провайдером (Npgsql) → строка SQL + параметры → выполнение через `NpgsqlCommand` → чтение строк `DbDataReader` → *материализация* в объекты (код-шаблон, скомпилированный и закэшированный). Результат компиляции запроса кэшируется по форме выражения, поэтому повторные вызовы дешевле первого.
- **Параметры.** Все значения передаются как параметры (`@p0`), а не склеиваются в строку: безопасность и повторное использование плана запроса в базе.
- **Модель строится один раз** при первом использовании контекста (по соглашениям + `OnModelCreating`) и кэшируется на уровне приложения; создание `DbContext` после этого дёшево, а соединения берутся из пула Npgsql — открывать и закрывать контекст часто можно.
- **Идентичность и кэш первого уровня.** Контекст хранит словарь «ключ → отслеживаемая сущность». Повторная загрузка той же строки в том же контексте вернёт тот же объект, а не новый (подробнее в теме про [change tracking](#p3-tracking)).
- **Провайдеры.** EF Core — слой над провайдером конкретной СУБД: `UseNpgsql`, `UseSqlServer`, `UseSqlite`. Один и тот же LINQ может давать разный SQL; особенности (`ILike`, массивы, `jsonb`) доступны через методы провайдера.
- **Не всё можно перевести.** Если часть выражения нельзя выразить в SQL, EF в современных версиях бросает исключение (раньше молча выполняла часть в памяти — «клиентская оценка» отключена именно потому, что тихо тянула всю таблицу).
- **`DbContext` и DI.** В ASP.NET Core контекст регистрируется как `Scoped` (один на HTTP-запрос) через `AddDbContext`; создавать его вручную с `new` — только в консольных проектах и тестах.

Справочник по теме (Microsoft Learn): раздел Entity Framework Core в документации .NET; ссылки на конкретные статьи есть в блоке «Не понятно?» этой страницы.

## Типичные ошибки и ловушки

- **Один `DbContext` на всё приложение (singleton).** Копит отслеживаемые сущности, не потокобезопасен, отдаёт устаревшие данные.
- **Обращение к навигации без `Include`.** `NullReferenceException` или пустая коллекция — EF не загружает связанные данные сам.
- **Свой C#-метод внутри `Where`.** Не переводится в SQL — исключение «could not be translated». Вынеси вызов до запроса или перепиши на выражение.
- **`ToList()` слишком рано.** Таблица грузится целиком, дальнейшие `Where` выполняются в памяти (см. [LINQ](#p2-linq)).
- **Включённый `EnableSensitiveDataLogging` в проде.** В логах окажутся значения параметров, включая персональные данные.
- **Пароль в строке подключения в git.** Используй user secrets/переменные окружения.
- **Смешивание синхронного и асинхронного кода.** `.Result` / `.Wait()` на `Task` в ASP.NET Core — риск взаимных блокировок; в вебе всё асинхронно.
- **Неявные размеры и точность.** `decimal` без `HasPrecision`, строки без `HasMaxLength` — в базе `text`/`numeric(18,2)`, и это может не соответствовать бизнес-правилам.
- **Отсутствие логирования SQL.** Не видишь, что делает ORM, — N+1 и тяжёлые запросы остаются незамеченными.
- **Правка модели без миграции.** Модель и схема расходятся; приложение падает с «column does not exist».
- **Игнорирование ограничений БД.** Только C#-валидация без `CHECK`/`UNIQUE` — последний рубеж остаётся открытым.

## Вопросы с собеседований

:::spoiler Что такое DbContext и какой у него должен быть срок жизни?
Сессия работы с базой: запросы, отслеживание изменений, сохранение. Короткоживущий объект на одну единицу работы (операцию, HTTP-запрос). Не потокобезопасен, не делается синглтоном.
:::

:::spoiler В какой момент выполняется SQL в запросе `db.Books.Where(...).OrderBy(...)`?
При материализации: `ToList`, `First`, `Count`, `foreach` и т. п. До этого строится дерево выражений `IQueryable`.
:::

:::spoiler Какой приоритет у соглашений, атрибутов и Fluent API?
Fluent API переопределяет атрибуты, атрибуты переопределяют соглашения.
:::

:::spoiler Чем Code First отличается от Database First? (ловушка: «одно и то же»)
Code First: классы — источник правды, схема создаётся миграциями. Database First: схема уже есть, классы генерируются по ней (scaffold). Выбор зависит от того, кто владеет схемой.
:::

:::spoiler Что такое ORM, и какие у него плюсы и минусы?
Отображение объектов на таблицы. Плюсы: быстрая разработка, типобезопасность, миграции, защита от инъекций. Минусы: «магия» скрывает SQL (N+1, неэффективные запросы), накладные расходы, ограничения на сложные запросы — тогда сырой SQL или Dapper.
:::

:::spoiler Почему значения в запросах передаются параметрами?
Защита от SQL-инъекций и возможность повторно использовать план запроса. Строковая склейка пользовательского ввода недопустима.
:::

:::spoiler Что такое `IQueryable` и чем он отличается от `List`?
Описание запроса, ещё не выполненного: при перечислении провайдер переводит дерево выражений в SQL. `List` — данные в памяти.
:::

:::spoiler Как посмотреть SQL, который сгенерировал EF Core?
`LogTo(Console.WriteLine)` в настройках контекста, `ToQueryString()` у запроса или логирование через `ILogger`. Включайте при разработке и читайте.
:::

## Что запомнить

- EF Core переводит LINQ в SQL, выполняет и материализует объекты; значения всегда уходят **параметрами**.
- `DbContext` — короткая сессия: запросы + отслеживание + `SaveChanges`; не потокобезопасен, не синглтон.
- `DbSet<T>` — `IQueryable<T>`: запрос выполняется при `ToList`/`First`/`Count`/`foreach`; `Where`/`Select`/`Include` только описывают его.
- Code First: классы → миграции → схема. Конфигурация: соглашения → атрибуты → Fluent API (приоритет у последнего).
- Свой C#-метод в `Where` не переводится; держи логирование SQL включённым и читай его.
- Навигации не загружаются сами; `Include`/проекция — тема про N+1.
- `ToQueryString()` — SQL без выполнения; строку подключения и пароли не коммитим.

## Практика

- [ ] Создал проект, подключил Npgsql, описал модель и `LibraryContext`
- [ ] Включил `LogTo` и для 5 разных LINQ-запросов записал сгенерированный SQL
- [ ] Сравнил SQL для `Select` в анонимный тип и без `Select` (загрузка целых сущностей)
- [ ] Нашёл LINQ-выражение, которое EF не смог перевести в SQL (например, вызов своего C#-метода в `Where`), и прочитал ошибку

@@page id="p3-migrations" phase="3" kind="topic" title="Миграции: история схемы в git" nav="Миграции" est="3 дня"
:::why
Схема базы меняется вместе с кодом: новый столбец, индекс, таблица. Миграции — это версии схемы, которые лежат в git рядом с кодом и одинаково применяются у тебя, у коллеги и на сервере. **Критерий фазы требует миграции в истории git, а не один squash-коммит.**
:::

## Зачем это нужно

Представь, что ты добавил читателю `Email`. У тебя в локальной базе столбец появился (ты руками выполнил `ALTER TABLE`), код работает. Коллега тянет твою ветку — и падает: «column Email does not exist». Потом то же самое повторяется на тестовом сервере, потом на проде. Кто-то забыл выполнить скрипт, у кого-то скрипт отличается от твоего, и через месяц у трёх окружений три разные схемы.

Миграции решают эту проблему системно:

- **Схема — часть кода.** Изменение модели и изменение схемы идут в одном коммите, ревьюятся вместе.
- **Воспроизводимость.** Пустая база превращается в актуальную одной командой `dotnet ef database update`; одинаково у тебя, у коллеги, в CI и на сервере.
- **История и откат.** У каждой миграции есть `Up` (применить) и `Down` (откатить), а в самой базе записано, какие уже применены.
- **Ревью.** SQL-скрипт миграции можно прочитать глазами до выкладки на прод.

Для собеседования и работы это одна из самых практичных тем: «как у вас меняется схема базы?» — вопрос про зрелость команды. Ответ «DBA руками выполняет скрипты в пятницу вечером» звучит хуже, чем «миграции в git, применяются в пайплайне, SQL-скрипт ревьюится».

## Интуиция и аналогия

**Журнал коммитов для схемы.** Git хранит историю кода как цепочку изменений; миграции хранят историю схемы как цепочку изменений. Каждая миграция — «коммит» с описанием «Add Email to Reader». Таблица `__EFMigrationsHistory` в базе — это как `HEAD`: она говорит, до какого «коммита» база уже доехала. Команда `database update` — это `git pull` для базы: применяет недостающие коммиты по порядку.

**Снимок модели — фотография дома после последнего ремонта.** Когда ты хочешь запланировать следующий ремонт, строитель сравнивает **текущий чертёж** (твои классы) с **фотографией после прошлого ремонта** (ModelSnapshot) и пишет список работ — только разницу. Он **не смотрит** в сам дом (в базу) — только на фотографию. Поэтому, если кто-то руками сломал стену в доме, миграция об этом не узнает.

**Переименование — частый обман.** Если ты стёр на чертеже надпись «Email» и написал «ContactEmail», строитель видит: «одна комната исчезла, другая появилась». Он не знает, что это та же комната, — и предлагает «снести и построить заново». Данные из комнаты пропадут. Именно поэтому переименования нужно проверять руками.

## Основная теория по шагам

### Шаг 1. Рабочий цикл

~~~bash
dotnet ef migrations add InitialCreate     # сравнить модель со снимком и сгенерировать миграцию
dotnet ef database update                  # применить все неприменённые миграции к базе
dotnet ef migrations list                  # какие есть и какие применены
dotnet ef migrations script --idempotent   # SQL-скрипт для ревью или для сервера
dotnet ef migrations remove                # удалить ПОСЛЕДНЮЮ, ещё не применённую миграцию
~~~

Что делает каждая команда:

- `migrations add Имя` — **не трогает базу**. Она читает модель (твой `DbContext`), сравнивает со снимком и пишет C#-файлы миграции.
- `database update` — идёт в базу, читает `__EFMigrationsHistory`, находит неприменённые миграции и выполняет их `Up` по порядку.
- `database update ИмяМиграции` — применяет или **откатывает** базу до указанной миграции (откат — вызовом `Down` у более новых). `database update 0` откатывает всё.
- `migrations remove` — удаляет последнюю миграцию и откатывает снимок; работает, пока она не применена к общим базам.
- `migrations script` — выдаёт SQL (диапазон `from to`, флаг `--idempotent` — скрипт, который сам проверяет, какие миграции уже применены).

После `migrations add` в проекте появляется папка `Migrations/`:

~~~text
Migrations/
├── 20261013120000_InitialCreate.cs            ← Up() и Down()
├── 20261013120000_InitialCreate.Designer.cs   ← метаданные
└── LibraryContextModelSnapshot.cs             ← снимок модели: с ним сравнивается следующая миграция
~~~

Имя файла начинается с метки времени — по ней миграции упорядочиваются. Именно поэтому две ветки с миграциями, созданные независимо, при слиянии дают конфликт снимка: порядок нужно разрешать вручную (обычно пересоздают свою миграцию поверх чужой).

### Шаг 2. Устройство миграции

~~~csharp Фрагмент сгенерированной миграции @nocheck
public partial class AddReaderEmail : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<string>(
            name: "Email",
            table: "Readers",
            type: "character varying(200)",
            maxLength: 200,
            nullable: true);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropColumn(name: "Email", table: "Readers");
    }
}
~~~

`Up` приводит схему вперёд, `Down` — назад; оба записаны на C# через `MigrationBuilder` (а не на SQL), чтобы одна миграция работала на разных СУБД. Провайдер превращает вызовы в SQL своего диалекта.

В самой базе EF Core ведёт служебную таблицу `__EFMigrationsHistory` — список применённых миграций. Вот как она выглядит (создадим её и посмотрим на настоящем PostgreSQL; значение `ProductVersion` здесь условное — это версия EF Core, создавшая запись):

~~~sql Таблица истории
CREATE TABLE "__EFMigrationsHistory" (
    "MigrationId"    varchar(150) NOT NULL PRIMARY KEY,
    "ProductVersion" varchar(32)  NOT NULL
);
INSERT INTO "__EFMigrationsHistory" VALUES ('20261013120000_InitialCreate', '10.0.0');
SELECT * FROM "__EFMigrationsHistory" ORDER BY "MigrationId";
~~~
~~~console
         MigrationId          | ProductVersion 
------------------------------+----------------
 20261013120000_InitialCreate | 10.0.0
(1 row)
~~~

### Шаг 3. Какой SQL получается: добавление столбца

Миграция `AddReaderEmail` в PostgreSQL превращается в одну строку DDL. Выполним её и посмотрим на результат через системный каталог:

~~~sql
ALTER TABLE "Readers" ADD "Email" character varying(200) NULL;

SELECT column_name, data_type, character_maximum_length AS len, is_nullable
FROM information_schema.columns
WHERE table_name = 'Readers'
ORDER BY ordinal_position;
~~~
~~~console
 column_name |     data_type     | len | is_nullable 
-------------+-------------------+-----+-------------
 Id          | integer           |     | NO
 FullName    | text              |     | NO
 CardNumber  | text              |     | NO
 Type        | text              |     | NO
 Email       | character varying | 200 | YES
(5 rows)
~~~

Столбец `Email` допускает `NULL` (`string?` в модели) — для уже существующих строк значение будет пустым, поэтому такая миграция безопасна.

### Шаг 4. Ловушка: новый NOT NULL столбец в таблице с данными

Если в модели `public string Phone { get; set; } = "";` (не `string?`), EF сгенерирует столбец `NOT NULL`. А в таблице уже есть строки — какое значение им дать?

~~~sql
ALTER TABLE "Readers" ADD "Phone" text NOT NULL;
~~~
~~~console
ERROR:  column "Phone" of relation "Readers" contains null values
~~~

Миграция упадёт на любой базе, где в таблице уже есть данные. Лекарство — значение по умолчанию (`defaultValue: ""` в `AddColumn`):

~~~sql
ALTER TABLE "Readers" ADD "Phone" text NOT NULL DEFAULT '';

SELECT count(*) AS readers, count(*) FILTER (WHERE "Phone" = '') AS with_empty_phone FROM "Readers";
~~~
~~~console
 readers | with_empty_phone 
---------+------------------
       4 |                4
(1 row)
~~~

На пустой локальной базе всё проходит гладко, поэтому такая ошибка всплывает на тестовом сервере, где данные есть. Правило: **проверяй миграции на базе с данными**.

### Шаг 5. Индексы и ограничения

Новый индекс — отдельная правка модели (`HasIndex(r => r.Email)`), значит отдельная миграция и отдельный коммит. SQL:

~~~sql
CREATE INDEX "IX_Readers_Email" ON "Readers" ("Email");

SELECT indexname FROM pg_indexes WHERE tablename = 'Readers' ORDER BY indexname;
~~~
~~~console
       indexname       
-----------------------
 IX_Readers_CardNumber
 IX_Readers_Email
 Readers_pkey
(3 rows)
~~~

Обрати внимание на имя индекса: `IX_<Таблица>_<Столбец>` — так EF называет индексы по соглашению. Уникальный индекс `IX_Readers_CardNumber` уже был в схеме с самого начала.

### Шаг 6. Переименование: где пропадают данные

Допустим, мы переименовали свойство `Email` в `ContactEmail`. Добавим читателям адреса и посмотрим два сценария. Сначала то, что нужно (`RenameColumn`):

~~~sql
UPDATE "Readers" SET "Email" = lower("CardNumber") || '@example.org';

ALTER TABLE "Readers" RENAME COLUMN "Email" TO "ContactEmail";

SELECT "FullName", "ContactEmail" FROM "Readers" ORDER BY "Id" LIMIT 3;
~~~
~~~console
   FullName    |   ContactEmail    
---------------+-------------------
 Анна Иванова  | r-001@example.org
 Борис Петров  | r-002@example.org
 Вера Смирнова | r-003@example.org
(3 rows)
~~~

Данные на месте. А вот что получится, если оставить то, что EF сгенерировал сам — `DropColumn` + `AddColumn`:

~~~sql
ALTER TABLE "Readers" DROP COLUMN "ContactEmail";
ALTER TABLE "Readers" ADD "ContactEmail" character varying(200) NULL;

SELECT count(*) AS readers, count("ContactEmail") AS with_email FROM "Readers";
~~~
~~~console
 readers | with_email 
---------+------------
       4 |          0
(1 row)
~~~

Все адреса потеряны, и база даже не предупредила: для неё это абсолютно корректные операции. Именно поэтому EF печатает при создании такой миграции предупреждение *An operation was scaffolded that may result in the loss of data. Please review the migration for accuracy*. Читать миграции перед применением — обязательное правило.

Почему EF сам не догадывается? Потому что сравнивает только два набора столбцов — «до» (снимок) и «после» (модель). Покажем это на упрощённой модели. Мини-«генератор миграций» в 20 строк работает ровно так же: считает разницу между двумя множествами.

~~~csharp
var snapshot = new Dictionary<string, HashSet<string>> { ["Readers"] = ["Id", "FullName", "Email"] };
var model    = new Dictionary<string, HashSet<string>> { ["Readers"] = ["Id", "FullName", "ContactEmail"] };

foreach (var (table, wanted) in model)
{
    var current = snapshot[table];
    foreach (var c in current.Except(wanted)) Console.WriteLine($"DropColumn {table}.{c}");
    foreach (var c in wanted.Except(current))  Console.WriteLine($"AddColumn  {table}.{c}");
}
~~~
~~~console
DropColumn Readers.Email
AddColumn  Readers.ContactEmail
~~~

С точки зрения генератора «Email исчез, ContactEmail появился» — не переименование, а пара независимых операций. (У настоящих инструментов есть эвристики, но надёжного способа понять намерение у них нет, поэтому править придётся вручную.)

### Шаг 7. Идемпотентный скрипт и откат

Для выкладки на сервер чаще используют не `database update` с машины разработчика, а SQL-скрипт:

~~~bash
dotnet ef migrations script --idempotent --output deploy.sql
~~~

Идемпотентный скрипт перед каждой миграцией проверяет `__EFMigrationsHistory` и пропускает уже применённые — его безопасно запускать на любой базе. Скрипт читают глазами (или DBA), а применяет пайплайн.

Откат: `dotnet ef database update AddReaderEmail` приведёт базу к состоянию «применена миграция AddReaderEmail, все более новые откачены» — вызовом их `Down`. Но `Down` не восстанавливает **данные**: если миграция удалила столбец, откат создаст пустой столбец заново. Откат миграции ≠ откат данных. Поэтому на проде основная страховка — резервная копия, а не `Down`.

### Шаг 8. Начальные данные

~~~csharp @nocheck
// в OnModelCreating — справочные данные, которые нужны всегда
model.Entity<Author>().HasData(
    new Author { Id = 1, Name = "Булгаков" },
    new Author { Id = 2, Name = "Достоевский" });
~~~

`HasData` подходит для небольших справочников (ключи указываются явно). Миграция превратит эти данные в `INSERT`/`UPDATE`/`DELETE`; при изменении значения в `HasData` следующая миграция сгенерирует `UPDATE`. Тысячи тестовых записей лучше загружать отдельной командой или скриптом (генератор из Фазы 2).

### Шаг 9. Правила, которые спасают данные

- **Одна логическая правка модели — одна миграция — один коммит** («Add Email to Reader»). Это и есть та история, которую проверяет критерий.
- **Читай каждую миграцию перед применением**, особенно переименования и удаления.
- **Не редактируй миграцию, которая уже применена** у кого-то ещё или на сервере. Нужна правка — новая миграция.
- **Новый NOT NULL столбец в таблице с данными** требует значения по умолчанию.
- Миграции коммитятся в git вместе с изменением модели; `Migrations/*` не добавляют в `.gitignore`.
- Имя миграции — смысл изменения (`AddReaderEmail`, `RenameEmailToContactEmail`), а не `Update1`.

## Как это работает под капотом

- **Три источника правды.** Модель в коде, снимок (`ModelSnapshot.cs`) и реальная схема в базе. `migrations add` сравнивает **модель со снимком**, `database update` сравнивает **список миграций с `__EFMigrationsHistory`**. Реальную схему в базе EF при этом не анализирует — поэтому ручные правки в базе приводят к «дрейфу схемы».
- **Порядок.** Миграции упорядочены по `MigrationId` (метка времени + имя). `database update` берёт те, которых нет в истории, и выполняет `Up` по возрастанию.
- **Транзакционность.** В PostgreSQL DDL выполняется в транзакции: если миграция упала на середине, изменения откатываются. Покажем: попытка в явной транзакции откатывается целиком.

~~~sql
BEGIN;
ALTER TABLE "Readers" ADD "Temp" integer;
ROLLBACK;

SELECT count(*) AS has_temp_column
FROM information_schema.columns
WHERE table_name = 'Readers' AND column_name = 'Temp';
~~~
~~~console
 has_temp_column 
-----------------
               0
(1 row)
~~~

  В других СУБД (например, MySQL) DDL автоматически подтверждает транзакцию, и упавшая посередине миграция оставляет базу в промежуточном состоянии — ещё одна причина читать скрипты.
- **Блокировки.** `ALTER TABLE` берёт блокировку таблицы. Большие изменения (индекс на огромной таблице, смена типа столбца) на проде блокируют запись; такие миграции планируют отдельно (`CREATE INDEX CONCURRENTLY` — вне транзакции, поэтому EF его требует вручную).
- **Что такое `MigrationBuilder`.** Объект, накапливающий список операций (`AddColumn`, `CreateIndex`, `Sql(...)`); провайдер Npgsql переводит операции в SQL. Если нужно что-то особенное (перенос данных между столбцами), используют `migrationBuilder.Sql("UPDATE ...")` между `AddColumn` и `DropColumn`.
- **Миграции при старте приложения** (`db.Database.Migrate()`) удобны для разработки, но на проде опасны: несколько экземпляров стартуют одновременно, у учётной записи приложения слишком много прав, а упавшая миграция роняет старт.

## Типичные ошибки и ловушки

- **Авто-переименование.** EF генерирует `DropColumn`+`AddColumn`, и данные пропадают. Исправляй вручную на `RenameColumn` и проверяй `Down`.
- **Правка применённой миграции.** У коллег и на сервере она уже записана в историю — изменения не выполнятся.
- **NOT NULL без значения по умолчанию** на таблице с данными — миграция падает только на непустой базе.
- **Ручные правки схемы в базе.** Модель, снимок и база расходятся; следующая миграция «не знает» об изменениях и либо падает, либо ничего не делает.
- **Одна гигантская миграция на весь спринт.** Невозможно ревьюить и откатывать частично; нарушается критерий «история в git».
- **Игнорирование предупреждения о потере данных** (*may result in the loss of data*).
- **Забытый коммит файлов `Migrations/`** (особенно `ModelSnapshot.cs`): у коллеги следующая миграция получится неверной.
- **Конфликт миграций при слиянии веток.** Две ветки создали миграции от одного снимка; решение — пересоздать свою миграцию поверх объединённого снимка.
- **`Migrate()` при старте на проде** с несколькими экземплярами и широкими правами.
- **Ожидание, что `Down` вернёт данные.** Он возвращает структуру, но не удалённые значения.

## Вопросы с собеседований

:::spoiler Что такое миграции и зачем они нужны?
Версионирование схемы базы в коде: каждая правка модели превращается в миграцию с `Up`/`Down`, хранится в git и применяется одинаково на всех окружениях. История применённых миграций хранится в таблице `__EFMigrationsHistory`.
:::

:::spoiler Зачем нужен ModelSnapshot?
Это снимок модели после последней миграции. `migrations add` сравнивает текущую модель со снимком и генерирует только разницу. С реальной базой он не сверяется.
:::

:::spoiler Что сделать, если миграция содержит DropColumn вместо переименования?
Не применять как есть: заменить пару `DropColumn`/`AddColumn` на `RenameColumn` (и проверить `Down`). Затем применить и проверить данные.
:::

:::spoiler Почему нельзя править уже применённую миграцию?
У других разработчиков и на сервере она уже записана в `__EFMigrationsHistory` и не будет выполнена повторно: изменения разойдутся. Правильно — новая миграция.
:::

:::spoiler Как применить миграции на проде? (ловушка: «`Database.Migrate()` при старте»)
Предпочтительно — сгенерировать идемпотентный SQL-скрипт (`migrations script --idempotent`), отревьюить и выполнить в пайплайне. `Migrate()` при старте допустим для разработки, но на проде рискован: параллельный старт нескольких экземпляров, избыточные права, падение старта.
:::

:::spoiler Откат миграции вернёт удалённые данные?
Нет. `Down` восстанавливает структуру, но не данные. Страховка — резервная копия.
:::

:::spoiler Чем `migrations remove` отличается от `database update <Предыдущая>`?
`remove` удаляет файлы **последней неприменённой** миграции из проекта; `database update` откатывает **базу** к указанной миграции, не удаляя файлов. Сначала откатывают базу, потом удаляют миграцию.
:::

:::spoiler Что произойдёт, если в таблице есть данные, а в модель добавили non-nullable свойство?
Миграция упадёт, пока не задано значение по умолчанию (или сначала столбец делают nullable, заполняют и затем ужесточают).
:::

## Что запомнить

- Миграция = версия схемы: `Up` вперёд, `Down` назад; хранится в git вместе с изменением модели.
- `migrations add` сравнивает **модель со снимком** и не трогает базу; `database update` применяет то, чего нет в `__EFMigrationsHistory`.
- Одна правка модели — одна миграция — один коммит; имя говорит о смысле.
- Переименование EF видит как Drop+Add — исправляй на `RenameColumn` вручную; всегда читай миграцию.
- NOT NULL на непустой таблице требует значения по умолчанию; тестируй миграции на базе с данными.
- Не правь применённые миграции; не лезь в схему руками.
- На проде — идемпотентный скрипт и бэкап; `Down` не возвращает данные.

## Практика

- [ ] Создал `InitialCreate`, применил, посмотрел таблицы в клиенте и `__EFMigrationsHistory`
- [ ] Сделал 4 отдельные миграции отдельными коммитами: новый столбец, индекс, новая таблица, переименование (с ручным исправлением на `RenameColumn`)
- [ ] Сгенерировал идемпотентный SQL-скрипт и прочитал его
- [ ] Откатил базу на предыдущую миграцию: `dotnet ef database update <ИмяМиграции>`

@@page id="p3-tracking" phase="3" kind="topic" title="Change tracking и SaveChanges" nav="Change tracking" est="4–5 дней"
:::why
«Я изменил объект, а в базе ничего не поменялось» и «почему этот запрос такой медленный и жрёт память» — оба вопроса про отслеживание изменений. Понимать его — значит знать, **какой SQL уйдёт при `SaveChanges`** и когда отслеживание не нужно.
:::

## Зачем это нужно

В обычном SQL ты сам пишешь `UPDATE ... SET ... WHERE ...`. В EF Core ты просто **меняешь свойство объекта**, вызываешь `SaveChanges()` — и в базе появляется нужный `UPDATE`. Откуда EF знает, что ты поменял, какие столбцы затронуть и в каком порядке отправить команды? Ответ — механизм отслеживания изменений (change tracking).

Без понимания этого механизма ты рано или поздно столкнёшься с одним из типичных сюрпризов:

- **«Я изменил, а в базе нет».** Сущность была из другого, уже закрытого контекста, или ты менял копию, или забыл `SaveChanges`.
- **«Почему возвращается старое значение?»** Контекст отдал закэшированную копию, а не свежую строку из базы.
- **«Отчёт грузится вечность и ест гигабайт».** Для каждой строки EF создал сущность и снимок исходных значений, хотя изменять ничего не собирались.
- **«Что-то сохранилось не так».** Две правки ушли в базу по отдельности, и вторая упала, оставив данные наполовину изменёнными.

Кроме практической пользы, тема регулярно встречается на собеседованиях: «Что такое `AsNoTracking`?», «Что делает `SaveChanges`?», «Что такое Unit of Work?», «Чем `Update` отличается от изменения свойства?». Если ты можешь объяснить механизм «снимок исходных значений → сравнение → команды», ты уверенно отвечаешь на все четыре.

## Интуиция и аналогия

**Редактор с режимом «Рецензирование».** В Word включаешь запись исправлений: документ помнит исходный текст и подсвечивает отличия. Пока ты печатаешь, ничего «не отправляется» — программа лишь запоминает, что было и что стало. Когда нажимаешь «Принять изменения» (`SaveChanges`), список отличий превращается в итоговые действия. EF Core делает то же самое с объектами: запоминает исходные значения (снимок), сравнивает с текущими и по разнице строит `INSERT`/`UPDATE`/`DELETE`.

**Корзина в магазине.** Ты кладёшь товары в корзину, достаёшь, меняешь количество — деньги не списываются. Списание (одна транзакция) происходит на кассе — в `SaveChanges`. Корзина — это и есть Unit of Work: накапливает намерения и применяет их разом.

**AsNoTracking — просмотр витрины.** Ты смотришь на товары, но не берёшь их в корзину. Дешевле: не нужно записывать, что ты там «держишь».

## Основная теория по шагам

### Шаг 1. Состояния сущности

Каждая сущность, известная контексту, находится в одном из состояний:

| Состояние | Значит | При `SaveChanges` |
|---|---|---|
| `Added` | новая, в базе ещё нет | `INSERT` |
| `Unchanged` | загружена и не менялась | ничего |
| `Modified` | загружена и изменена | `UPDATE` только изменённых столбцов |
| `Deleted` | помечена на удаление | `DELETE` |
| `Detached` | контекст о ней не знает | ничего |

Посмотреть состояние можно так:

~~~csharp @nocheck
using var db = new LibraryContext();

var book = db.Books.First(b => b.Isbn == "978-5-01");    // Unchanged
Console.WriteLine(db.Entry(book).State);                 // Unchanged

book.Copies = 5;                                         // просто присваивание
db.ChangeTracker.DetectChanges();
Console.WriteLine(db.Entry(book).State);                 // Modified
Console.WriteLine(db.ChangeTracker.DebugView.LongView);  // что и как изменилось

db.SaveChanges();
// UPDATE "Books" SET "Copies" = @p0 WHERE "Id" = @p1;   ← только изменённый столбец
~~~

Заметь: присваивание `book.Copies = 5` — обычная операция C#, EF не перехватывает её. Состояние `Modified` появляется только после того, как EF **сравнит** текущие значения со снимком — при вызове `DetectChanges()` (он вызывается автоматически в `SaveChanges`, `Entry(...)`, `ChangeTracker.Entries()` и ряде других мест).

### Шаг 2. Собственный мини-трекер: механизм на 40 строках

Самый надёжный способ понять механизм — написать упрощённую версию. Ниже — «контекст», который хранит снимок исходных значений каждой загруженной сущности, находит изменения сравнением и строит SQL-команды. Это не EF Core, но принцип идентичен.

~~~csharp
var db = new MiniContext();

var book = db.Load(new Book { Id = 1, Title = "Мастер и Маргарита", Copies = 3 });   // «загрузили из базы»
Console.WriteLine($"после загрузки:                 {db.StateOf(book)}");

book.Copies = 5;                                                                    // просто присваивание
Console.WriteLine($"после присваивания:             {db.StateOf(book)}");
db.DetectChanges();
Console.WriteLine($"после DetectChanges:             {db.StateOf(book)}");

db.Add(new Book { Id = 2, Title = "Золотой телёнок", Copies = 2 });
db.SaveChanges();
Console.WriteLine($"после SaveChanges:              {db.StateOf(book)}");

var again = db.Load(new Book { Id = 1, Title = "из базы пришло другое", Copies = 99 });
Console.WriteLine($"тот же объект? {ReferenceEquals(book, again)}, Copies = {again.Copies}");

db.Remove(book);
db.SaveChanges();

var other = new MiniContext();
Console.WriteLine($"в другом контексте: {other.StateOf(book)}");

enum EntityState { Detached, Unchanged, Added, Modified, Deleted }

class Book { public int Id { get; set; } public string Title { get; set; } = ""; public int Copies { get; set; } }

class MiniContext
{
    class Entry { public Book Entity = null!; public Dictionary<string, object?> Original = new(); public EntityState State; }

    readonly Dictionary<int, Entry> _map = new();                               // «карта идентичности»
    static readonly System.Reflection.PropertyInfo[] Props = typeof(Book).GetProperties();
    static Dictionary<string, object?> Snapshot(Book b) => Props.ToDictionary(p => p.Name, p => p.GetValue(b));

    public Book Load(Book fromDb)
    {
        if (_map.TryGetValue(fromDb.Id, out var known)) return known.Entity;    // тот же Id → тот же объект
        _map[fromDb.Id] = new Entry { Entity = fromDb, Original = Snapshot(fromDb), State = EntityState.Unchanged };
        return fromDb;
    }
    public void Add(Book b) => _map[b.Id] = new Entry { Entity = b, State = EntityState.Added };
    public void Remove(Book b) => _map[b.Id].State = EntityState.Deleted;
    public EntityState StateOf(Book b) =>
        _map.TryGetValue(b.Id, out var e) && ReferenceEquals(e.Entity, b) ? e.State : EntityState.Detached;

    public void DetectChanges()
    {
        foreach (var e in _map.Values.Where(e => e.State == EntityState.Unchanged))
            if (Props.Any(p => !Equals(p.GetValue(e.Entity), e.Original[p.Name]))) e.State = EntityState.Modified;
    }

    public void SaveChanges()
    {
        DetectChanges();
        foreach (var (id, e) in _map.ToList())
        {
            switch (e.State)
            {
                case EntityState.Added:
                    Console.WriteLine($"  INSERT INTO Books (Title, Copies) VALUES ('{e.Entity.Title}', {e.Entity.Copies})"); break;
                case EntityState.Modified:
                    var changed = Props.Where(p => !Equals(p.GetValue(e.Entity), e.Original[p.Name]));
                    Console.WriteLine($"  UPDATE Books SET {string.Join(", ", changed.Select(p => $"{p.Name} = {p.GetValue(e.Entity)}"))} WHERE Id = {id}"); break;
                case EntityState.Deleted:
                    Console.WriteLine($"  DELETE FROM Books WHERE Id = {id}"); _map.Remove(id); continue;
            }
            e.Original = Snapshot(e.Entity); e.State = EntityState.Unchanged;
        }
    }
}
~~~
~~~console
после загрузки:                 Unchanged
после присваивания:             Unchanged
после DetectChanges:             Modified
  UPDATE Books SET Copies = 5 WHERE Id = 1
  INSERT INTO Books (Title, Copies) VALUES ('Золотой телёнок', 2)
после SaveChanges:              Unchanged
тот же объект? True, Copies = 5
  DELETE FROM Books WHERE Id = 1
в другом контексте: Detached
~~~

Что здесь видно:

1. После присваивания состояние всё ещё `Unchanged` — пока никто не сравнил значения со снимком.
2. `UPDATE` содержит **только изменённый столбец** (`Copies`), а не все.
3. Повторная загрузка той же строки вернула **тот же объект**, а новые значения из «базы» (`Copies = 99`) были проигнорированы. Это не баг, а свойство кэша первого уровня («карты идентичности»): внутри одного контекста одна строка — один объект.
4. В другом контексте та же сущность — `Detached`: он о ней ничего не знает.

### Шаг 3. SQL, который соответствует этим операциям

Реальные команды для `Copies = 5` и `INSERT` выглядят так (выполним их на настоящем PostgreSQL):

~~~sql
UPDATE "Books" SET "Copies" = 5 WHERE "Id" = 1 RETURNING "Id", "Title", "Copies";
~~~
~~~console
 Id |       Title        | Copies 
----+--------------------+--------
  1 | Мастер и Маргарита |      5
(1 row)
~~~

Если бы EF отправлял все столбцы, любое изменение одного поля затирало бы чужие правки соседних. Отправка только изменённого — важная часть корректности при параллельной работе.

### Шаг 4. SaveChanges — это одна транзакция

Контекст накапливает изменения, а `SaveChanges()` отправляет их **одной транзакцией**: либо применились все, либо ни одной.

~~~csharp Выдача книги: несколько изменений — один SaveChanges — одна транзакция @nocheck
using var db = new LibraryContext();

var reader = db.Readers.Single(r => r.CardNumber == "R-001");
var book = db.Books.Single(b => b.Isbn == "978-5-01");

db.Loans.Add(new Loan
{
    Book = book,
    Reader = reader,
    LoanedAt = new DateOnly(2026, 10, 13),
    DueAt = new DateOnly(2026, 10, 27),
});
reader.FullName = reader.FullName.Trim();

db.SaveChanges();   // INSERT в Loans + UPDATE Readers — в одной транзакции
~~~

Что значит «в одной транзакции», видно на SQL: пока транзакция не подтверждена, изменения видны только ей, а откат возвращает всё как было.

~~~sql
BEGIN;
INSERT INTO "Loans" ("BookId", "ReaderId", "LoanedAt", "DueAt") VALUES (1, 1, '2026-10-13', '2026-10-27');
UPDATE "Readers" SET "FullName" = trim("FullName") WHERE "CardNumber" = 'R-001';
SELECT count(*) AS loans_inside_transaction FROM "Loans";
ROLLBACK;

SELECT count(*) AS loans_after_rollback FROM "Loans";
~~~
~~~console
 loans_inside_transaction 
--------------------------
                        8
(1 row)

 loans_after_rollback 
----------------------
                    7
(1 row)
~~~

Если одна из команд падает (например, нарушено ограничение `CHECK` или уникальный индекс), EF откатывает транзакцию, и ни `INSERT`, ни `UPDATE` не остаются в базе. Контекст накапливает изменения и отправляет их пачкой — это и есть паттерн Unit of Work, встроенный в EF Core, к нему вернёмся в [Repository/UoW](#p3-repository).

### Шаг 5. Чтение без отслеживания

~~~csharp @nocheck
var report = db.Books
    .AsNoTracking()                      // не запоминать исходные значения — быстрее и меньше памяти
    .Where(b => b.Year > 1900)
    .ToList();
~~~

Для данных «только показать» (списки, отчёты, ответы API) отслеживание не нужно: не создаётся запись в карте идентичности и снимок исходных значений. **Проекция в DTO через `Select` не отслеживается вовсе** — и это самый частый способ чтения в API.

Нюанс: `AsNoTracking()` отключает и карту идентичности, поэтому если несколько строк ссылаются на одну связанную (например, 100 выдач одного читателя), без отслеживания получится 100 разных объектов `Reader`. Для таких случаев есть `AsNoTrackingWithIdentityResolution()`.

### Шаг 6. Массовые операции в обход трекера

Иногда загружать сущности, чтобы поменять одно поле у тысячи строк, — расточительство. С EF Core 7 есть `ExecuteUpdate` и `ExecuteDelete`: они сразу отправляют один `UPDATE`/`DELETE` и **не используют трекер**:

~~~csharp @nocheck
db.Books
    .Where(b => b.Genre == "Роман")
    .ExecuteUpdate(s => s.SetProperty(b => b.Copies, b => b.Copies + 1));
~~~

Этому вызову соответствует один SQL-запрос на любое число строк:

~~~sql
WITH u AS (
    UPDATE "Books" SET "Copies" = "Copies" + 1 WHERE "Genre" = 'Роман' RETURNING "Id", "Copies"
)
SELECT * FROM u ORDER BY "Id";
~~~
~~~console
 Id | Copies 
----+--------
  1 |      6
  3 |      3
  4 |      2
  6 |      3
(4 rows)
~~~

Минусы: ни трекер, ни события, ни `SaveChanges` не участвуют; уже загруженные в этот контекст сущности **не обновятся** (они хранят старые значения); вызов выполняется немедленно, вне общей транзакции `SaveChanges`.

### Шаг 7. Параллельные правки: оптимистичная конкурентность

Две пользовательские сессии могут одновременно прочитать `Copies = 3` и сохранить каждая своё значение. По умолчанию побеждает последний, и первая правка теряется (lost update). EF Core решает это **токеном конкурентности**: в `WHERE` добавляется проверка исходного значения, и если затронуто 0 строк, выбрасывается `DbUpdateConcurrencyException`.

~~~csharp @nocheck
b.Property(x => x.Copies).IsConcurrencyToken();      // или специальный столбец версии (rowversion / xmin)
~~~

Вторая сессия, ожидавшая, что `Copies` всё ещё 3, отправит примерно такой SQL — и не обновит ничего:

~~~sql
UPDATE "Books" SET "Copies" = 4 WHERE "Id" = 1 AND "Copies" = 3 RETURNING "Id";
~~~
~~~console
 Id 
----
(0 rows)
~~~

Пустой результат (0 строк) — сигнал «кто-то уже изменил эту строку». Приложение решает, что делать: перечитать и повторить, спросить пользователя или отказать.

### Шаг 8. Отсоединённые сущности: Update и Attach

В веб-приложении сущность чаще приходит из HTTP-запроса, а не из контекста: для контекста она `Detached`. Есть два пути:

- **Загрузить заново и применить изменения** (правильный по умолчанию): `var book = db.Books.Find(id); book.Copies = dto.Copies; db.SaveChanges();` — `UPDATE` содержит только реально изменённые столбцы и проверяет, что запись существует.
- **`db.Update(entity)`** — помечает сущность как `Modified` целиком: `UPDATE` перезапишет **все** столбцы значениями из объекта. Если клиент прислал неполный объект, остальные поля затрутся значениями по умолчанию.
- `db.Attach(entity)` и ручная пометка отдельных свойств (`Entry(e).Property(p => p.Copies).IsModified = true`) — для точечных обновлений без загрузки.

## Как это работает под капотом

- **Снимок исходных значений.** При загрузке сущности EF сохраняет копию значений всех её свойств («original values»). Это стоит память — вместе с записью в карте идентичности это и есть цена отслеживания, которую убирает `AsNoTracking`.
- **DetectChanges.** Обходит все отслеживаемые сущности и сравнивает текущие значения со снимком. Для тысяч сущностей это заметно: сложность линейна по их числу, а вызывается он при каждом `SaveChanges` (и ряде других операций). Поэтому «пакетная» загрузка десятков тысяч сущностей с трекингом тормозит, и поэтому за один `SaveChanges` не стоит добавлять сотни тысяч строк.
- **Порядок команд.** EF сортирует команды по зависимостям внешних ключей: сначала родитель, потом дочерние при `INSERT`, и наоборот при `DELETE`. Сгенерированные ключи (identity) подставляются в зависимые сущности автоматически.
- **Пакетирование.** Команды `SaveChanges` отправляются пакетами (несколько команд за обращение к серверу), в одной транзакции, если вы не открыли свою.
- **Карта идентичности.** Словарь «тип + ключ → сущность» гарантирует один объект на строку внутри контекста. `Find(id)` сначала смотрит туда и только потом идёт в базу, а обычный запрос всё равно идёт в базу, но при материализации подставит уже известный объект (значения из базы для него не перезапишут твои несохранённые правки).
- **Уведомления об изменениях.** Вместо сравнения можно реализовать `INotifyPropertyChanged` (сущность сама сообщает об изменении), но чаще для скорости используют `AsNoTracking` и проекции.
- **DbContext не потокобезопасен**, потому что внутреннее состояние (карта, снимки) не защищено от параллельной записи.

Справочник: эти темы разобраны в статьях по Entity Framework Core (раздел о change tracking) в документации Microsoft Learn.

## Типичные ошибки и ловушки

:::danger Долгоживущий контекст
Один `DbContext` на всё приложение копит тысячи отслеживаемых объектов: память растёт, `DetectChanges` замедляется, данные устаревают (контекст отдаёт свою закэшированную копию сущности). Контекст — на единицу работы.
:::

:::danger Изменил объект из другого контекста
Сущность, загруженная одним контекстом и изменённая после его закрытия, для нового контекста — `Detached`. `SaveChanges` нового контекста ничего не сохранит, пока ты не вызовешь `Update(entity)` или (лучше) не загрузишь сущность заново и не применишь изменения.
:::

:::danger Тяжёлая загрузка с отслеживанием ради отчёта
`db.Loans.ToList()` на 100 000 строк с отслеживанием — много лишней памяти и времени. Для отчёта — `AsNoTracking()` или `Select` в нужную форму.
:::

- **Забытый `SaveChanges`.** Изменения живут только в памяти контекста; без вызова в базу ничего не уйдёт.
- **`Update(entity)` для неполного объекта.** Перезапишет все столбцы, включая те, которых в объекте нет.
- **`SaveChanges` в цикле.** Каждый вызов — отдельная транзакция и обращение к базе; вызывай один раз после всех правок.
- **Ожидание свежих данных от повторного запроса.** Если сущность уже в контексте, ты получишь прежний объект со своими (возможно устаревшими) значениями; для актуальных данных — новый контекст или `AsNoTracking`.
- **Массовые `ExecuteUpdate` при загруженных сущностях.** Трекер об изменениях не знает, и локальные копии остаются прежними.
- **Игнорирование конкурентности.** Без токена две параллельные правки молча затирают друг друга.
- **Одновременная работа двух потоков с одним контекстом.** Исключение «A second operation was started on this context instance».

## Вопросы с собеседований

:::spoiler Какие состояния бывают у сущности и что происходит с каждым при SaveChanges?
Added → INSERT, Modified → UPDATE изменённых столбцов, Deleted → DELETE, Unchanged и Detached → ничего.
:::

:::spoiler Как EF узнаёт, что свойство изменилось, если ты просто присвоил значение?
Он хранит снимок исходных значений и при `DetectChanges` (вызывается автоматически в `SaveChanges` и ряде других методов) сравнивает их с текущими.
:::

:::spoiler Когда использовать AsNoTracking?
Когда данные только читаются и не будут изменяться и сохраняться через этот контекст: списки, отчёты, ответы API.
:::

:::spoiler Что делает SaveChanges с точки зрения транзакций?
Отправляет все накопленные команды одной транзакцией: либо применяются все, либо ни одна (при ошибке откат). Если нужна общая транзакция на несколько `SaveChanges`, открывают её явно (`Database.BeginTransaction`).
:::

:::spoiler Чем `Update(entity)` отличается от загрузки и изменения свойств? (ловушка: «одно и то же»)
`Update` помечает всю сущность как `Modified`, `UPDATE` пишет все столбцы значениями из объекта. При загрузке и точечном изменении уходят только реально изменённые столбцы, и можно проверить существование записи.
:::

:::spoiler Что такое карта идентичности (identity map)?
Словарь «ключ → сущность» внутри контекста: одна строка — один объект. Поэтому повторная загрузка возвращает тот же объект, а `Find` может вообще не обращаться к базе.
:::

:::spoiler Как обнаружить, что строку изменил кто-то другой? 
Оптимистичная конкурентность: токен (`IsConcurrencyToken`, столбец версии). EF добавляет проверку исходного значения в `WHERE`; если затронуто 0 строк, выбрасывается `DbUpdateConcurrencyException`.
:::

:::spoiler Что быстрее для обновления тысячи строк: загрузить и изменить или ExecuteUpdate?
`ExecuteUpdate` — один SQL-запрос без загрузки и трекинга. Цена: обход трекера (загруженные сущности не обновятся, события и доменная логика не отработают).
:::

## Что запомнить

- Состояния: `Added`, `Unchanged`, `Modified`, `Deleted`, `Detached`; `SaveChanges` превращает их в `INSERT`/`UPDATE`/`DELETE`.
- EF хранит снимок исходных значений и сравнивает при `DetectChanges`; присваивание свойства само ничего не отправляет.
- `UPDATE` содержит только изменённые столбцы; `Update(entity)` — все.
- `SaveChanges` = одна транзакция = Unit of Work; вызывай один раз после всех правок.
- Внутри контекста строка = один объект (карта идентичности); повторный запрос не перезапишет твои правки.
- Чтение «только показать» — `AsNoTracking` или проекция `Select`; массовые правки — `ExecuteUpdate`/`ExecuteDelete`.
- Контекст короткоживущий и непотокобезопасный; для параллельных правок — токен конкурентности.

## Практика

- [ ] Вывел `DebugView.LongView` после добавления, изменения и удаления сущностей
- [ ] Убедился по логу SQL, что `UPDATE` содержит только изменённые столбцы
- [ ] Сравнил время и память загрузки 10 000 выдач с отслеживанием и с `AsNoTracking()`
- [ ] Воспроизвёл «изменение не сохранилось» с сущностью из закрытого контекста и исправил

@@page id="p3-relations" phase="3" kind="topic" title="Связи в EF Core: один-ко-многим, многие-ко-многим" nav="Связи в EF Core" est="4–5 дней"
:::why
Почти каждая сущность связана с другими. Неправильно настроенная связь — это неожиданные каскадные удаления, лишние таблицы и навигации, которые всегда `null`. Здесь ты переносишь [схему из темы про нормализацию](#p3-design) в модель EF Core осознанно.
:::

## Зачем это нужно

В базе связь — это внешний ключ: столбец `ReaderId` в `Loans` ссылается на `Readers.Id`. В коде C# связь выглядит иначе: у выдачи есть свойство `Reader` — сам объект читателя, у читателя — список `Loans`. EF Core отвечает за перевод между этими двумя мирами: по твоей модели он создаёт внешние ключи и индексы, при загрузке связывает объекты, а при сохранении расставляет значения ключей и порядок `INSERT`.

Настройка связей — место, где проще всего получить самые неприятные ошибки:

- **Неожиданное каскадное удаление.** Удалил читателя — вместе с ним пропала вся история выдач, потому что по умолчанию для обязательной связи включён `Cascade`.
- **Лишние таблицы и столбцы.** Забыл про внешний ключ — EF создал «теневое» свойство; опечатался в навигации — получил две связи вместо одной.
- **`NullReferenceException`.** Навигация есть, а данных нет: EF не загружает связанные объекты, пока не попросишь.
- **Неверная кратность.** «Один к одному» без уникального индекса — это на самом деле «один ко многим».

Вопросы про связи на собеседованиях стабильны: «Как настроить многие-ко-многим?», «Что такое навигационное свойство?», «Как работает каскадное удаление?», «Чем обязательная связь отличается от необязательной?». Здесь ты разберёшь все четыре на живых примерах, SQL которых проверен на настоящей СУБД.

## Интуиция и аналогия

**Ссылки между карточками в картотеке.** Читательский билет (читатель) и бланк выдачи (выдача): на бланке записан номер билета (`ReaderId` — внешний ключ). Вместе с бланком ты можешь держать в руках и сам билет (навигация `Reader`), и пачку бланков, лежащую в билете (навигация `Loans`). Это один и тот же факт, записанный с двух сторон — «на бланке есть номер билета», — просто удобный для чтения и туда, и обратно. **Настоящая связь — это ключ в базе; навигации — удобство кода.**

**Многие-ко-многим — перекрёстная таблица в журнале.** Книга может иметь нескольких авторов, у автора — несколько книг. Одной ссылки недостаточно ни там, ни там, поэтому заводят третью таблицу-«журнал соответствий» (книга, автор). EF может скрыть её от тебя (тогда видны только списки `Authors` и `Books`) или показать как явную сущность — когда в журнале есть собственные данные, например порядок авторов.

**Каскад — домино.** Если книга стоит в ряду домино с выдачами, то при её падении (удалении) падают и все выдачи. Иногда это нужно (удалили заказ — удалились его позиции), иногда катастрофа (удалили читателя — потеряли историю операций). Решение — всегда осознанное.

## Основная теория по шагам

### Шаг 1. Один-ко-многим

~~~csharp @nocheck
public class Reader
{
    public int Id { get; set; }
    public List<Loan> Loans { get; } = new();     // коллекция «многих»
}

public class Loan
{
    public int Id { get; set; }
    public int ReaderId { get; set; }             // FK: int — связь ОБЯЗАТЕЛЬНАЯ (NOT NULL)
    public Reader Reader { get; set; } = null!;   // ссылка на «одного»
}
~~~

EF Core находит связь по соглашениям: навигация `Reader` + свойство `ReaderId` (имя навигации + `Id`, либо имя типа + `Id`). Тип FK определяет обязательность: `int` — обязательная (`NOT NULL`), `int?` — необязательная (`NULL` допустим).

Термины, которые стоит знать:

- **Principal** (главная сторона) — «один» (`Reader`); **dependent** (зависимая) — «многие» (`Loan`); внешний ключ всегда живёт у зависимой стороны.
- **Навигация-ссылка** (`Loan.Reader`) указывает на одну сущность, **навигация-коллекция** (`Reader.Loans`) — на набор.
- Достаточно **одной** навигации: можно оставить только `Loan.Reader` или только `Reader.Loans`, связь всё равно будет.

~~~csharp Явная настройка — когда нужно поведение удаления или нестандартные имена @nocheck
model.Entity<Loan>()
    .HasOne(l => l.Reader)
    .WithMany(r => r.Loans)
    .HasForeignKey(l => l.ReaderId)
    .OnDelete(DeleteBehavior.Restrict);
~~~

В учебной схеме это связь `Loans.ReaderId` → `Readers.Id` с `ON DELETE RESTRICT`. Проверим на базе: удалить читателя с выдачами не получится.

~~~sql
DELETE FROM "Readers" WHERE "Id" = 1;
~~~
~~~console
ERROR:  update or delete on table "Readers" violates foreign key constraint "FK_Loans_Readers_ReaderId" on table "Loans"
DETAIL:  Key (Id)=(1) is still referenced from table "Loans".
~~~

База защитила историю: пока есть выдачи, читателя не удалить. Приложение получит `DbUpdateException` с причиной «violates foreign key constraint».

### Шаг 2. Поведение при удалении: Cascade, Restrict, SetNull

`OnDelete` задаёт, что делать с зависимыми строками при удалении главной:

| `DeleteBehavior` | Что происходит | Когда уместно |
|---|---|---|
| `Cascade` | зависимые строки удаляются вместе с главной | части целого: позиции заказа, комментарии поста |
| `Restrict` / `NoAction` | удаление главной запрещено, пока есть зависимые | история и учёт: выдачи, платежи |
| `SetNull` | во внешний ключ записывается `NULL` (связь должна быть необязательной) | «ссылка не обязательна»: автор удалён, но книга остаётся |
| `ClientSetNull` (по умолчанию для необязательных) | EF сам обнуляет FK в **загруженных** сущностях; база ничего не делает | осторожно: незагруженные зависимые не обнулятся |

Для **обязательных** связей по умолчанию стоит `Cascade`. Вот как выглядит каскад в базе: книга удаляется вместе с выдачами (внешний ключ `Loans.BookId` создан с `ON DELETE CASCADE`). Выполним в транзакции и откатим:

~~~sql
BEGIN;
SELECT count(*) AS loans_before FROM "Loans";
DELETE FROM "Books" WHERE "Id" = 1;
SELECT count(*) AS loans_after FROM "Loans";
ROLLBACK;
~~~
~~~console
 loans_before 
--------------
            7
(1 row)

 loans_after 
-------------
           4
(1 row)
~~~

Одна команда `DELETE` по книге унесла все её выдачи. Теперь то же самое, но для трёх вариантов поведения — в виде маленькой симуляции на чистом C#:

~~~csharp
foreach (var behavior in new[] { DeleteBehavior.Cascade, DeleteBehavior.Restrict, DeleteBehavior.SetNull })
{
    var loans = new List<Loan> { new(1, 7), new(2, 7), new(3, 8) };      // у читателя 7 две выдачи
    Console.WriteLine($"{behavior,-9} → {DeleteReader(7, loans, behavior)}");
}

static string DeleteReader(int readerId, List<Loan> loans, DeleteBehavior behavior)
{
    var dependents = loans.Count(l => l.ReaderId == readerId);
    switch (behavior)
    {
        case DeleteBehavior.Restrict when dependents > 0:
            return $"ошибка: у читателя {dependents} выдач(и)";
        case DeleteBehavior.Cascade:
            loans.RemoveAll(l => l.ReaderId == readerId);
            break;
        case DeleteBehavior.SetNull:
            for (var i = 0; i < loans.Count; i++)
                if (loans[i].ReaderId == readerId) loans[i] = loans[i] with { ReaderId = null };
            break;
    }
    return $"читатель удалён; выдач осталось {loans.Count}, без читателя {loans.Count(l => l.ReaderId is null)}";
}

enum DeleteBehavior { Cascade, Restrict, SetNull }
record Loan(int Id, int? ReaderId);
~~~
~~~console
Cascade   → читатель удалён; выдач осталось 1, без читателя 0
Restrict  → ошибка: у читателя 2 выдач(и)
SetNull   → читатель удалён; выдач осталось 3, без читателя 2
~~~

:::warn Каскадное удаление по умолчанию
Для **обязательных** связей EF Core по умолчанию настраивает `Cascade`: удалишь читателя — удалятся все его выдачи. Для истории операций это почти всегда неправильно. Решай явно для каждой связи.
:::

### Шаг 3. Многие-ко-многим: простой вариант

~~~csharp @nocheck
public class Book   { public int Id { get; set; } public List<Author> Authors { get; } = new(); }
public class Author { public int Id { get; set; } public List<Book> Books { get; } = new(); }
// EF сам создаст таблицу связи AuthorBook (AuthorsId, BooksId) с составным PK
~~~

Если по обе стороны есть навигации-коллекции, EF Core (начиная с 5.0) сам создаёт таблицу связи — её нет в твоих классах, это «skip navigation». Названия по соглашению: `AuthorBook`, столбцы `AuthorsId` и `BooksId` (имя навигации + `Id`), первичный ключ составной. Вот что реально лежит в такой таблице:

~~~sql
SELECT a."Name", b."Title"
FROM "AuthorBook" ab
JOIN "Authors" a ON a."Id" = ab."AuthorsId"
JOIN "Books"   b ON b."Id" = ab."BooksId"
ORDER BY a."Name", b."Title"
LIMIT 4;
~~~
~~~console
    Name     |       Title        
-------------+--------------------
 Булгаков    | Мастер и Маргарита
 Булгаков    | Собачье сердце
 Гоголь      | Мёртвые души
 Достоевский | Идиот
(4 rows)
~~~

### Шаг 4. Многие-ко-многим: явная сущность связи

Когда у связи появляются собственные данные (порядок авторов, роль, дата добавления), скрытой таблицы недостаточно — нужна явная сущность:

~~~csharp @nocheck
public class BookAuthor
{
    public int BookId { get; set; }
    public Book Book { get; set; } = null!;
    public int AuthorId { get; set; }
    public Author Author { get; set; } = null!;
    public int Order { get; set; }               // «первый автор», «второй автор» — данные связи
}

// в OnModelCreating
model.Entity<BookAuthor>().HasKey(x => new { x.BookId, x.AuthorId });
~~~

Схема, которую построит такая модель, и перенос существующих связей в неё (в миграции это делают `migrationBuilder.Sql`):

~~~sql
CREATE TABLE "BookAuthor" (
    "BookId"   integer NOT NULL REFERENCES "Books" ("Id")   ON DELETE CASCADE,
    "AuthorId" integer NOT NULL REFERENCES "Authors" ("Id") ON DELETE CASCADE,
    "Order"    integer NOT NULL,
    PRIMARY KEY ("BookId", "AuthorId")
);
INSERT INTO "BookAuthor" ("BookId", "AuthorId", "Order")
SELECT "BooksId", "AuthorsId", 1 FROM "AuthorBook";

SELECT count(*) AS links, min("Order") AS first_order FROM "BookAuthor";
~~~
~~~console
 links | first_order 
-------+-------------
     7 |           1
(1 row)
~~~

Составной ключ `(BookId, AuthorId)` не позволит записать одну и ту же пару дважды. Обрати внимание, что столбец называется `"Order"` — слово зарезервировано в SQL, поэтому его нужно брать в кавычки; EF делает это автоматически.

### Шаг 5. Один-к-одному

~~~csharp @nocheck
public class ReaderProfile
{
    public int Id { get; set; }
    public int ReaderId { get; set; }            // FK + уникальный индекс
    public Reader Reader { get; set; } = null!;
    public string? Address { get; set; }
}

model.Entity<Reader>()
    .HasOne<ReaderProfile>()
    .WithOne(p => p.Reader)
    .HasForeignKey<ReaderProfile>(p => p.ReaderId);
~~~

Отличие от «один-ко-многим» — **уникальный индекс** на внешнем ключе: ровно это делает связь «один к одному». EF создаёт его сам. Проверим:

~~~sql
CREATE TABLE "ReaderProfile" (
    "Id"       integer GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    "ReaderId" integer NOT NULL REFERENCES "Readers" ("Id") ON DELETE CASCADE,
    "Address"  text NULL
);
CREATE UNIQUE INDEX "IX_ReaderProfile_ReaderId" ON "ReaderProfile" ("ReaderId");

INSERT INTO "ReaderProfile" ("ReaderId", "Address") VALUES (1, 'ул. Мира, 1');
INSERT INTO "ReaderProfile" ("ReaderId", "Address") VALUES (1, 'ул. Мира, 2');
~~~
~~~console
ERROR:  duplicate key value violates unique constraint "IX_ReaderProfile_ReaderId"
DETAIL:  Key ("ReaderId")=(1) already exists.
~~~

Второй профиль у того же читателя база не пропустила. Без уникального индекса это была бы обычная связь «один ко многим».

### Шаг 6. Необязательные связи и внешние ключи

Нужна ли книге обязательная ссылка, зависит от бизнес-правила. Выбор между `int` и `int?` в свойстве-ключе — это выбор между «обязательно» и «может отсутствовать». Для явной настройки используют `.IsRequired()` / `.IsRequired(false)`. Практическое правило: связи, у которых «родитель всегда существует» (выдача → читатель), делай обязательными; необязательные оставляй там, где реально бывают «сироты» (например, комментарий к удалённому посту, если его нужно сохранить).

Свойство внешнего ключа (`ReaderId`) можно и не объявлять — EF создаст «теневое» свойство. Но явный ключ в классе удобнее: можно привязать сущность по идентификатору без загрузки родителя (`new Loan { ReaderId = 5, ... }`), это экономит запрос.

### Шаг 7. Связи в запросах и при сохранении

Навигации не загружаются сами — об этом следующая тема, [загрузка данных](#p3-loading). При сохранении же работает «исправление связей» (relationship fix-up): присвоил `loan.Reader = reader` — EF подставит `ReaderId`; добавил `reader.Loans.Add(loan)` — установит и ссылку на читателя, и внешний ключ. Новые сущности вместе с новыми связанными добавляются одним `SaveChanges`, а ключи (identity) EF проставляет сам и в правильном порядке (сначала родитель).

## Как это работает под капотом

- **Обнаружение связей.** При построении модели EF просматривает навигации и свойства-ключи, сопоставляет пары по соглашениям (`Reader` ↔ `ReaderId`). Если соглашения неоднозначны (две связи между одними типами), нужна явная настройка Fluent API.
- **Результат — в схеме.** Связь превращается в `FOREIGN KEY` с `ON DELETE ...` и индексом на внешнем ключе (`IX_Loans_ReaderId`) — EF индексирует FK по умолчанию, ведь без этого соединения и каскады пришлось бы выполнять полным перебором.
- **Каскад в двух местах.** Поведение удаления настраивается в базе (`ON DELETE CASCADE`) и в EF: для **загруженных** в контекст зависимых сущностей EF сам помечает их `Deleted`; остальное сделает база. Поэтому `ClientSetNull` может оставить «потерянные» строки, если зависимые не были загружены.
- **Skip navigations.** Для простой связи «многие-ко-многим» EF создаёт скрытый тип сущности (`Dictionary<string, object>`-подобный «shared-type entity») и две связи «один-ко-многим» к нему. Поэтому её поведение можно настраивать через `UsingEntity`.
- **Порядок INSERT/DELETE.** EF строит граф зависимостей и сортирует команды: родитель добавляется раньше потомка, удаляется — позже.
- **Циклы.** Взаимные ссылки (A→B и B→A) требуют, чтобы один из ключей был необязательным; иначе порядок вставки не определить.
- **Параметры не склеиваются:** все ключи передаются параметрами (`@p0`), как и в любых запросах EF.

## Типичные ошибки и ловушки

:::danger Навигация есть, а данных нет
`loan.Reader.FullName` → `NullReferenceException`, потому что EF **не загружает связанные данные автоматически**. Нужен `Include` или проекция — следующая тема.
:::

:::danger Двусторонние навигации «на всякий случай»
Каждая навигация — это решение о том, по какому пути ходит код. Если `Author.Books` никто не использует, она не обязательна. Модель должна отражать нужные сценарии, а не все возможные.
:::

- **Каскад по умолчанию на обязательных связях.** Удаление «справочной» записи сносит историю. Явно ставь `Restrict`.
- **«Один-к-одному» без уникального индекса.** Фактически получается «один-ко-многим».
- **Опечатка в имени ключа.** `ReaderID` вместо `ReaderId` — EF не распознает соглашение и создаст ещё один теневой ключ и лишний столбец.
- **Две связи между одними и теми же типами** (например, `Author`, `Translator` в `Book`) без явной настройки — исключение при построении модели.
- **Скрытая таблица связи, когда нужны данные связи.** Потом приходится мигрировать данные на явную сущность.
- **Присваивание обеих сторон по-разному.** `loan.ReaderId = 5` и `loan.Reader = otherReader` одновременно — побеждает навигация, и ключ перезапишется; не смешивай способы.
- **Циклические каскады.** СУБД может отказаться создавать схему с несколькими путями каскадного удаления (классическая проблема SQL Server; в PostgreSQL проще, но смысл тот же).
- **Нет индекса на внешнем ключе** в ручной схеме: соединения и каскадное удаление становятся медленными (EF создаёт его сам).

## Вопросы с собеседований

:::spoiler Как EF определяет, обязательная связь или нет?
По nullability внешнего ключа (`int` — обязательная, `int?` — нет) или явно через `IsRequired()` в Fluent API.
:::

:::spoiler Когда нужна явная сущность для связи многие-ко-многим?
Когда у связи есть собственные данные (порядок, роль, дата) или нужен прямой доступ к строкам связи.
:::

:::spoiler Что такое навигационное свойство и чем оно отличается от внешнего ключа?
Навигация — ссылка на связанный объект (или коллекцию) в коде; внешний ключ — значение-идентификатор, которое реально хранится в столбце. Связь определяет ключ; навигации — удобство кода.
:::

:::spoiler Что произойдёт при удалении читателя, у которого есть выдачи? (ловушка: «ничего, EF сам разберётся»)
Зависит от `OnDelete`. Для обязательной связи по умолчанию — `Cascade`, и выдачи удалятся. С `Restrict` база откажет с нарушением внешнего ключа. Поведение надо выбрать осознанно.
:::

:::spoiler Как сделать связь «один к одному»?
Внешний ключ на зависимой стороне плюс уникальный индекс на нём. В EF Core: `HasOne(...).WithOne(...).HasForeignKey<TDependent>(...)`.
:::

:::spoiler Чем `Restrict` отличается от `SetNull`?
`Restrict` запрещает удаление главной записи, пока есть зависимые. `SetNull` разрешает удаление и записывает `NULL` во внешний ключ зависимых — для этого связь должна быть необязательной.
:::

:::spoiler Нужно ли объявлять свойство внешнего ключа?
Нет, EF создаст теневое свойство. Но явный `ReaderId` удобнее: можно связывать сущности по идентификатору без загрузки родителя.
:::

## Что запомнить

- Настоящая связь — внешний ключ в базе; навигации — удобство кода. Достаточно одной навигации.
- Тип ключа определяет обязательность: `int` — обязательная, `int?` — необязательная.
- Для обязательных связей по умолчанию `Cascade` — выбирай `OnDelete` явно, особенно для истории операций (`Restrict`).
- Многие-ко-многим: навигации с обеих сторон — таблица связи создаётся сама; есть данные у связи — явная сущность с составным ключом.
- Один-к-одному = внешний ключ + уникальный индекс.
- Связанные данные не загружаются сами; тема загрузки — следующая.
- Проверяй получившуюся схему в базе, а не только в коде.

## Практика

- [ ] Настроил все связи учебной модели и проверил получившуюся схему в базе
- [ ] Явно задал `OnDelete` для каждой связи и обосновал выбор комментарием
- [ ] Перевёл авторство книги на явную сущность `BookAuthor` с порядком авторов (отдельной миграцией)
- [ ] Проверил на практике каскадное удаление и `Restrict`

@@page id="p3-loading" phase="3" kind="topic" title="Загрузка связанных данных и проблема N+1" nav="Загрузка данных и N+1" est="~1 неделя"
:::why
**Второй пункт критерия:** объяснить N+1 на своём примере, который сам сломал и сам починил. N+1 — самая частая причина медленных API у джунов: на тестовой базе из 10 строк незаметна, на реальной — 1000 запросов на одну страницу.
:::

## Зачем это нужно

Связанные данные в EF Core не загружаются сами. Ты запросил выдачи — получил выдачи; книга, читатель и авторы остались в базе, а навигации в объектах пусты (`null` или пустая коллекция). Как именно подгрузить связанное — решение, от которого зависят скорость и память приложения. Три сценария показывают, насколько это важно:

- **Страница списка.** Нужно показать 50 выдач с названием книги и именем читателя. Наивная реализация делает 1 запрос за выдачами и по 2 запроса на каждую строку — 101 обращение к базе вместо одного.
- **Отчёт.** Нужно число выдач по каждому из 5 000 читателей. Если считать в цикле — 5 001 запрос.
- **Карточка книги.** Нужны авторы и выдачи сразу. Два `Include` коллекций одним запросом дают таблицу-«перемножение», и сети передаётся в десятки раз больше строк, чем реально данных.

Эти ошибки не видны на тестовой базе из десяти строк и всплывают на проде, когда страница отвечает по семь секунд. Поэтому на собеседованиях любят спрашивать: «Что такое N+1? Как заметить? Как исправить? Чем `Include` отличается от проекции? Что такое ленивая загрузка и почему она опасна?» Хороший ответ строится на собственном примере: сломал — увидел в логе — починил — сравнил число запросов.

## Интуиция и аналогия

**Поход в магазин.** N+1 — это когда ты идёшь в магазин за списком из 100 продуктов и приносишь **по одному** за поход: сто походов. Каждый поход — это дорога туда-обратно (сетевая задержка), а сам поиск товара на полке (работа базы) занимает мгновение. Один поход с полным списком — сто покупок при одной дороге. Поэтому дело не в сложности запроса, а в **количестве обращений**.

**Декартов взрыв — слишком широкий заказ.** Просишь у склада «книги вместе с их выдачами и авторами» одной накладной: склад составляет строки для каждой комбинации «выдача × автор». У книги 10 выдач и 10 авторов — 100 строк вместо 20 нужных. Либо одна огромная накладная (JOIN), либо несколько небольших (split query) — выбирай по ситуации.

**Ленивая загрузка — официант-невидимка.** Ты просто обращаешься к `loan.Book`, и «кто-то» незаметно бежит на кухню (в базу). Удобно, пока не окажется, что ты делаешь это в цикле на тысячу блюд.

## Основная теория по шагам

### Шаг 1. Способы загрузить связанные данные

| Способ | Как | Когда |
|---|---|---|
| **Eager** (жадная) | `Include` / `ThenInclude` в запросе | связанные данные точно нужны, и сущности будут изменяться |
| **Проекция** | `Select` в DTO / анонимный тип | чтение для показа — **лучший вариант по умолчанию** |
| **Explicit** (явная) | `db.Entry(x).Collection(...).Load()` | догрузить по условию для уже загруженной сущности |
| **Lazy** (ленивая) | навигация загружается при первом обращении | выключена по умолчанию; источник N+1 |

### Шаг 2. Eager loading: Include

~~~csharp Eager loading @nocheck
var loans = db.Loans
    .Include(l => l.Book)
        .ThenInclude(b => b.Authors)
    .Include(l => l.Reader)
    .Where(l => l.ReturnedAt == null)
    .ToList();
// один SQL с JOIN-ами: выдачи + книги + авторы + читатели
~~~

`Include` добавляет `JOIN` и загружает связанные сущности вместе с основными; `ThenInclude` спускается на уровень глубже. Вот примерно тот SQL, что уходит в базу для выдач с книгами и читателями (выполним его):

~~~sql
SELECT l."Id", l."DueAt", b."Title", r."FullName"
FROM "Loans" AS l
INNER JOIN "Books"   AS b ON l."BookId"   = b."Id"
INNER JOIN "Readers" AS r ON l."ReaderId" = r."Id"
WHERE l."ReturnedAt" IS NULL
ORDER BY l."Id";
~~~
~~~console
 Id |   DueAt    |          Title           |   FullName    
----+------------+--------------------------+---------------
  2 | 2026-10-04 | Преступление и наказание | Анна Иванова
  4 | 2026-10-31 | Двенадцать стульев       | Борис Петров
  6 | 2026-10-16 | Мастер и Маргарита       | Вера Смирнова
(3 rows)
~~~

Для обязательных связей EF использует `INNER JOIN`, для необязательных — `LEFT JOIN`. Загружаются все столбцы всех таблиц и создаются отслеживаемые сущности — это расходует память, поэтому для чтения «только показать» лучше следующий способ.

### Шаг 3. Проекция — берём только то, что нужно

~~~csharp @nocheck
var onHand = db.Loans
    .Where(l => l.ReturnedAt == null)
    .Select(l => new
    {
        Reader = l.Reader.FullName,
        l.Book.Title,
        l.DueAt,
    })
    .ToList();
// JOIN генерируется автоматически, Include не нужен, отслеживания нет
~~~

Проекция тянет **только перечисленные столбцы**, сама добавляет нужные `JOIN`, не создаёт отслеживаемых сущностей и не требует помнить, что «заинклюдить». В API она — вариант по умолчанию. `Include` берут, когда нужны именно сущности целиком (например, чтобы их изменить).

### Шаг 4. N+1: ломаем {#n1}

~~~csharp ❌ 1 запрос за читателями + N запросов в цикле @nocheck
var readers = db.Readers.ToList();                          // запрос №1

foreach (var r in readers)
{
    int count = db.Loans.Count(l => l.ReaderId == r.Id);    // запрос №2, №3, … №N+1
    Console.WriteLine($"{r.FullName}: {count}");
}
~~~

В логе SQL увидишь один `SELECT ... FROM "Readers"` и затем **по одному** `SELECT count(*) ... WHERE "ReaderId" = @p` на каждого читателя. 5 000 читателей — 5 001 обращение к базе, каждое со своей сетевой задержкой.

Чтобы увидеть проблему в числах без настоящей базы, смоделируем «базу» с счётчиком обращений. Параллельно считаем, сколько строк передано (это та самая «цена» каждого способа):

~~~csharp
var db = new FakeDb(readers: 1000, loansPerReader: 20);

// ❌ N+1: цикл с запросом внутри
var slow = new Dictionary<int, int>();
foreach (var r in db.GetReaders()) slow[r.Id] = db.CountLoans(r.Id);
Report("N+1 (цикл с запросом)", db);

// ✅ агрегат: считает база
var viaAggregate = db.CountLoansByReader();
Report("агрегат в одном запросе", db);

// ✅ одним запросом выдачи + группировка в памяти
var lookup = db.GetAllLoans().ToLookup(l => l.ReaderId);
var viaLookup = db.GetReaders().ToDictionary(r => r.Id, r => lookup[r.Id].Count());
Report("ToLookup в памяти", db);

Console.WriteLine($"результаты одинаковы: {slow.All(kv => viaAggregate[kv.Key] == kv.Value && viaLookup[kv.Key] == kv.Value)}");

void Report(string name, FakeDb d) { Console.WriteLine($"{name,-26} запросов: {d.Queries,5}, строк передано: {d.Rows,6}"); d.Reset(); }

record Reader(int Id);
record Loan(int Id, int ReaderId);

class FakeDb
{
    public int Queries, Rows;
    readonly List<Reader> _readers;
    readonly List<Loan> _loans = new();
    public FakeDb(int readers, int loansPerReader)
    {
        _readers = Enumerable.Range(1, readers).Select(i => new Reader(i)).ToList();
        foreach (var r in _readers) for (var k = 0; k < loansPerReader; k++) _loans.Add(new Loan(_loans.Count + 1, r.Id));
    }
    public void Reset() { Queries = 0; Rows = 0; }
    public List<Reader> GetReaders() { Queries++; Rows += _readers.Count; return _readers.ToList(); }
    public int CountLoans(int readerId) { Queries++; Rows++; return _loans.Count(l => l.ReaderId == readerId); }
    public Dictionary<int, int> CountLoansByReader() { Queries++; Rows += _readers.Count; return _loans.GroupBy(l => l.ReaderId).ToDictionary(g => g.Key, g => g.Count()); }
    public List<Loan> GetAllLoans() { Queries++; Rows += _loans.Count; return _loans.ToList(); }
}
~~~
~~~console
N+1 (цикл с запросом)      запросов:  1001, строк передано:   2000
агрегат в одном запросе    запросов:     1, строк передано:   1000
ToLookup в памяти          запросов:     2, строк передано:  21000
результаты одинаковы: True
~~~

Результат один и тот же, но число обращений различается в сотни раз. Заметь и тонкость: вариант «`ToLookup` в памяти» делает 2 запроса, зато передаёт 21 000 строк, а агрегат — 1 000. **Меньше запросов не всегда означает меньше работы:** тащить всю таблицу ради подсчёта хуже, чем попросить базу посчитать.

То же касается ленивой загрузки: `foreach (var l in loans) Console.WriteLine(l.Book.Title);` — при включённом lazy loading каждое обращение к `l.Book` незаметно ходит в базу. Тот же N+1, только замаскированный под обычное свойство.

### Шаг 5. N+1: чиним

~~~csharp ✅ Один запрос: агрегат считает база @nocheck
var stats = db.Readers
    .Select(r => new { r.FullName, Count = r.Loans.Count })
    .OrderByDescending(x => x.Count)
    .ToList();
~~~

Примерно такой SQL уйдёт в базу (выполним его на учебных данных):

~~~sql
SELECT r."FullName", (
    SELECT count(*)::int FROM "Loans" AS l WHERE r."Id" = l."ReaderId") AS "Count"
FROM "Readers" AS r
ORDER BY 2 DESC, 1;
~~~
~~~console
   FullName    | Count 
---------------+-------
 Анна Иванова  |     3
 Борис Петров  |     2
 Вера Смирнова |     2
 Глеб Орлов    |     0
(4 rows)
~~~

Один запрос вместо N+1. Другие варианты исправления: `Include`, если нужны сами сущности, или загрузка всех нужных выдач одним запросом и группировка в памяти через `ToLookup` (подходит, когда данных немного и они нужны целиком).

:::key Как ловить N+1
1. Логирование SQL включено всегда во время разработки.
2. Подозрительно: обращение к `db` **внутри цикла**, обращение к навигации внутри цикла.
3. Счётчик запросов на одну операцию: если он растёт вместе с объёмом данных — это N+1.
:::

### Шаг 6. Explicit loading: догрузить по условию

~~~csharp @nocheck
var reader = db.Readers.Single(r => r.CardNumber == "R-001");
if (needHistory)
    db.Entry(reader).Collection(r => r.Loans).Load();
~~~

Явная загрузка нужна, когда связанные данные нужны не всегда, и решение принимается уже после загрузки основной сущности. Можно догрузить с фильтром: `.Query().Where(...).Load()`. Это точечный инструмент; в цикле он снова превращается в N+1.

### Шаг 7. Ленивая загрузка: почему выключена по умолчанию

Lazy loading включается пакетом `Microsoft.EntityFrameworkCore.Proxies` и `UseLazyLoadingProxies()`: EF создаёт наследников сущностей, перехватывающих обращение к навигации. Требования: навигации `virtual`, сущности не `sealed`. Удобство — не нужно думать о `Include`. Цена — невидимые запросы, N+1 «из коробки», зависимость от живого контекста (обратиться к навигации после `Dispose` — исключение). В серьёзных проектах её обычно держат выключенной, а нужное загружают явно (`Include`/проекция).

Смоделируем механику: свойство, которое при первом обращении «ходит в базу»:

~~~csharp
var db = new Db();
var loans = db.GetLoans(100).ToList();                // запрос №1
foreach (var l in loans) _ = l.Book.Title;            // обращение к «навигации»: каждый раз запрос
Console.WriteLine($"lazy:  запросов {db.Queries}");

db.Queries = 0;
var joined = db.GetLoansWithBooks(100);               // один «JOIN»
foreach (var l in joined) _ = l.Book.Title;
Console.WriteLine($"eager: запросов {db.Queries}");

record BookInfo(string Title);

class LoanLazy
{
    readonly Db _db; BookInfo? _book;
    public LoanLazy(Db db, int id) { _db = db; Id = id; }
    public int Id { get; }
    public BookInfo Book => _book ??= _db.LoadBook(Id);     // как прокси: при первом обращении
    public void Preload(BookInfo b) => _book = b;
}

class Db
{
    public int Queries;
    public IEnumerable<LoanLazy> GetLoans(int n) { Queries++; return Enumerable.Range(1, n).Select(i => new LoanLazy(this, i)); }
    public BookInfo LoadBook(int id) { Queries++; return new BookInfo("Книга " + id); }
    public List<LoanLazy> GetLoansWithBooks(int n)
    {
        Queries++;
        return Enumerable.Range(1, n).Select(i => { var l = new LoanLazy(this, i); l.Preload(new BookInfo("Книга " + i)); return l; }).ToList();
    }
}
~~~
~~~console
lazy:  запросов 101
eager: запросов 1
~~~

### Шаг 8. Обратная проблема: декартов взрыв

`Include` нескольких коллекций (`.Include(b => b.Loans).Include(b => b.Authors)`) порождает один `JOIN`, где для каждой книги строк = выдачи × авторы. Данных едет в разы больше, чем нужно, а книга с её полями дублируется в каждой строке. Посмотрим на настоящих данных: сколько строк даёт одно соединение и сколько — два раздельных запроса:

~~~sql
SELECT b."Id" AS book,
       count(*) AS joined_rows,
       (SELECT count(*) FROM "Loans" WHERE "BookId" = b."Id")
     + (SELECT count(*) FROM "AuthorBook" WHERE "BooksId" = b."Id") AS split_rows
FROM "Books" AS b
LEFT JOIN "Loans"      AS l  ON l."BookId"  = b."Id"
LEFT JOIN "AuthorBook" AS ab ON ab."BooksId" = b."Id"
GROUP BY b."Id"
ORDER BY b."Id";
~~~
~~~console
 book | joined_rows | split_rows 
------+-------------+------------
    1 |           3 |          4
    2 |           1 |          2
    3 |           1 |          2
    4 |           1 |          1
    5 |           1 |          1
    6 |           4 |          4
    7 |           1 |          0
(7 rows)
~~~

На учебных данных выигрыша нет вовсе — у книг по одному автору и две-три выдачи, и раздельные запросы даже вернут чуть больше строк (каждая коллекция приходит отдельно). Но JOIN растёт **мультипликативно**, а раздельные запросы — слагаемыми: чем больше элементов в каждой коллекции, тем хуже. Простой подсчёт:

~~~csharp
foreach (var (loans, authors) in new[] { (3, 2), (10, 10), (100, 20), (1000, 50) })
    Console.WriteLine($"выдач {loans,4}, авторов {authors,2}: JOIN → {loans * authors,6} строк, раздельно → {loans + authors,5}");
~~~
~~~console
выдач    3, авторов  2: JOIN →      6 строк, раздельно →     5
выдач   10, авторов 10: JOIN →    100 строк, раздельно →    20
выдач  100, авторов 20: JOIN →   2000 строк, раздельно →   120
выдач 1000, авторов 50: JOIN →  50000 строк, раздельно →  1050
~~~

Решения: проекция в нужную форму или `.AsSplitQuery()` — EF разобьёт загрузку на несколько запросов (по одному на коллекцию):

~~~csharp @nocheck
var books = db.Books
    .Include(b => b.Loans)
    .Include(b => b.Authors)
    .AsSplitQuery()
    .ToList();
~~~

Раздельные запросы примерно такие (по одному на коллекцию, с одинаковым порядком в основной части):

~~~sql
SELECT b."Id", b."Title" FROM "Books" AS b ORDER BY b."Id" LIMIT 3;

SELECT l."Id", l."BookId"
FROM "Books" AS b
INNER JOIN "Loans" AS l ON l."BookId" = b."Id"
WHERE b."Id" <= 3
ORDER BY b."Id", l."Id";
~~~
~~~console
 Id |          Title           
----+--------------------------
  1 | Мастер и Маргарита
  2 | Собачье сердце
  3 | Преступление и наказание
(3 rows)

 Id | BookId 
----+--------
  1 |      1
  3 |      1
  6 |      1
  5 |      2
  2 |      3
(5 rows)
~~~

Цена split query: несколько обращений и возможная неконсистентность между ними (данные могли измениться между запросами). Общее правило: **для нескольких коллекций — `AsSplitQuery` или проекция; для одной — обычный `Include`.**

## Как это работает под капотом

- **Почему N+1 так дорог.** Время одного запроса — это сеть (десятые доли миллисекунды до десятков в облаке) + разбор и выполнение. Сам поиск по ключу в базе — микросекунды. Поэтому стоимость почти целиком определяется числом обращений: 1 000 запросов по 1 мс — секунда, а один запрос на то же — миллисекунды. (См. в справочнике [Big-O и реальные цены операций](#/ref/g/pf-bigo-lies).)
- **Как EF превращает `Include` в SQL.** Строит `JOIN`, выбирает столбцы всех таблиц, а при материализации «склеивает» строки обратно в граф: дубликаты родителя объединяются картой идентичности (см. [Change tracking](#p3-tracking)). При `AsNoTracking` дубликаты не объединяются — для этого есть `AsNoTrackingWithIdentityResolution`.
- **Фильтрованный Include.** Можно ограничить загружаемую коллекцию: `Include(b => b.Loans.Where(l => l.ReturnedAt == null))`. Это не то же самое, что фильтр на родителя.
- **Fix-up навигаций.** Если нужные сущности уже в контексте (загружены раньше), EF сам связывает их между собой — отсюда «магия», когда навигация внезапно оказывается заполненной после другого запроса. Не полагайся на это: модель должна быть явной.
- **Проекция и трекинг.** Анонимные типы и DTO не отслеживаются; но если внутри проекции вернуть саму сущность, она будет отслеживаться.
- **Почему не всегда JOIN.** Для коллекций внутри проекции EF иногда использует подзапросы или отдельные запросы; читай получившийся SQL, а не гадай.
- **Ленивая загрузка и прокси.** `UseLazyLoadingProxies` создаёт наследников с перехватом свойств. Для `sealed`-типов и не-`virtual` навигаций она не работает; лог SQL показывает запросы, созданные ею.

## Типичные ошибки и ловушки

- **Обращение к `db` или навигации внутри цикла** — классический N+1.
- **`Include` «на всякий случай» везде.** Тянешь лишние данные, расходуешь память; для чтения лучше проекция.
- **Несколько `Include` коллекций без `AsSplitQuery`.** Декартов взрыв.
- **Фильтр после `ToList()`.** Все данные грузятся в память и фильтруются там.
- **Ленивая загрузка в веб-приложении.** Скрытые запросы при сериализации ответа: JSON-сериализатор обходит навигации, и каждая превращается в запрос (плюс циклы ссылок).
- **Подсчёт через `.ToList().Count`** вместо `Count()`/`Any()` — загружается всё.
- **Ориентация только на число запросов.** Один запрос на 100 000 лишних строк хуже десяти точных.
- **Измерение на пустой базе.** Проблема появляется только на данных — заполни базу генератором.
- **Игнорирование лога SQL.** Если ты не смотришь на SQL, N+1 не заметен, пока не пожалуются пользователи.
- **Потеря данных при `Include` с фильтром** на необязательных связях, если путать `Where` внутри `Include` и `Where` на основной сущности.

## Вопросы с собеседований

:::spoiler Объясни N+1 на своём примере (вопрос из критерия)
Шаблон ответа: «Я загрузил список из N сущностей одним запросом, а затем в цикле для каждой обращался к связанным данным (явно через `db` или через ленивую навигацию). EF отправлял отдельный запрос на каждую итерацию — всего N+1. Я увидел это в логе SQL: [сколько запросов было]. Исправил проекцией/`Include`/агрегатом в одном запросе: стал один запрос, время упало с … до …»
:::

:::spoiler Почему проекция часто лучше Include?
Загружает только нужные столбцы, не создаёт отслеживаемых сущностей, автоматически строит нужные JOIN-ы и не требует думать, что заинклюдить.
:::

:::spoiler Что такое декартов взрыв и как его избежать?
При `Include` нескольких коллекций один JOIN даёт произведение строк коллекций, и объём данных резко растёт. Лечится проекцией или `AsSplitQuery()`.
:::

:::spoiler Чем eager, explicit и lazy loading отличаются?
Eager — связанные данные загружаются сразу с запросом (`Include`); explicit — по запросу программиста после загрузки основной сущности (`Entry(...).Load()`); lazy — автоматически при первом обращении к навигации (через прокси), что опасно из-за скрытых запросов.
:::

:::spoiler Как найти N+1 в существующем приложении? (ловушка: «по времени ответа»)
По логу SQL и по счётчику запросов: если число запросов растёт вместе с числом записей и в логе повторяются почти одинаковые `SELECT` с разным параметром — это N+1. Время ответа лишь косвенный признак.
:::

:::spoiler Всегда ли один запрос лучше нескольких?
Нет. Один запрос с `Include` нескольких коллекций может вернуть на порядки больше строк, чем два раздельных. Смотри на объём передаваемых данных, а не только на число обращений.
:::

:::spoiler Что делает `AsSplitQuery`, и какие у него минусы?
Разбивает загрузку с несколькими коллекциями на несколько SQL-запросов — нет перемножения строк. Минусы: больше обращений и возможная несогласованность данных между запросами (без общей транзакции/снимка).
:::

:::spoiler Почему lazy loading отключён по умолчанию?
Потому что скрывает обращения к базе: N+1 возникает незаметно, а сериализация ответа может запустить сотни запросов. Явная загрузка делает стоимость видимой.
:::

## Что запомнить

- Связанные данные не загружаются сами: `Include`, проекция, явная или ленивая загрузка.
- Для чтения по умолчанию — проекция (`Select`); `Include` — когда нужны сущности.
- N+1: запрос внутри цикла (явный или через ленивую навигацию). Ловится логом SQL и счётчиком запросов, лечится агрегатом/`Include`/проекцией.
- Меньше запросов ≠ меньше работы: считай и строки, а не только обращения.
- Несколько `Include` коллекций → декартов взрыв → `AsSplitQuery` или проекция.
- Lazy loading держи выключенным; стоимость должна быть видна в коде.
- Проверяй на заполненной базе и всегда читай сгенерированный SQL.

## Практика

- [ ] Сгенерировал 1 000 читателей и 20 000 выдач, **намеренно написал N+1** и записал число запросов и время из лога
- [ ] Исправил тремя способами (агрегат в `Select`, `Include`, загрузка одним запросом + `ToLookup`) и сравнил время
- [ ] Включил lazy loading (пакет `Microsoft.EntityFrameworkCore.Proxies`), воспроизвёл N+1 через навигацию и снова выключил
- [ ] Воспроизвёл декартов взрыв с двумя `Include` коллекций и исправил `AsSplitQuery()`
- [ ] Записал голосовую заметку с объяснением N+1 на своём примере — это и есть проверка критерия

@@page id="p3-repository" phase="3" kind="topic" title="Repository и Unit of Work: когда нужны, а когда вредят" nav="Repository и UoW" est="2–3 дня"
:::why
В половине туториалов EF Core оборачивают в `IRepository<T>` + `IUnitOfWork`. Задача этой темы — понимать, **что EF уже делает сам**, и принимать решение осознанно. На собеседовании вопрос «нужен ли репозиторий поверх EF Core?» проверяет именно это.
:::

## Зачем это нужно

Ты открываешь учебный проект на GitHub и видишь папки `Repositories`, `UnitOfWork`, интерфейс `IRepository<T>` на каждую сущность и тонкие классы, которые просто вызывают `_context.Set<T>().Find(id)`. Сразу вопросы: так положено? Без этого не возьмут на работу? Или это лишний слой?

Честный ответ — «зависит от того, какую проблему ты решаешь». Паттерны Repository и Unit of Work появились задолго до EF, когда доступ к базе делали вручную через ADO.NET и SQL-строки: тогда они действительно давали порядок. EF Core — уже реализация обоих паттернов, и добавление поверх неё ещё одного слоя «по привычке» часто лишь прячет возможности ORM и множит код.

Зачем разобраться именно сейчас:

- **На собеседовании** вопрос звучит почти дословно: «Нужен ли репозиторий поверх EF Core?» Ответ «да, всегда» и «нет, никогда» одинаково слабые; сильный — с критериями.
- **В реальных проектах** ты встретишь оба варианта: и «сервисы напрямую с `DbContext`», и «слоистую архитектуру с репозиториями». Нужно уметь читать и то и другое и не ломать принятый стиль.
- **В своём проекте** (Фаза 4 и дальше) тебе придётся выбирать самому, и критерии должны быть не вкусовыми.

## Интуиция и аналогия

**Библиотекарь против стеллажей.** `DbSet<T>` — это сами стеллажи с удобным каталогом: ты сам умеешь найти, добавить, снять с полки. Репозиторий — библиотекарь, который говорит на языке читателя: «принеси просроченные выдачи», «сколько книг на руках у Иванова?». Если у тебя один стеллаж и пять простых запросов, нанимать библиотекаря не нужно. Если десятки сложных запросов повторяются в разных отделах, а читатели не должны знать устройство хранилища — библиотекарь окупается.

Но **библиотекарь, умеющий только «дай всё» и «положи на полку»** (`GetAll`/`Add`), бесполезен: это те же стеллажи с лишним посредником, и ты вынужден таскать на стойку всю библиотеку и перебирать руками.

**Unit of Work — одна касса.** Покупатель набирает товары в нескольких отделах, а платит один раз на кассе. Если бы каждый отдел брал оплату отдельно, при нехватке денег на последний товар первые уже были бы оплачены. Единая транзакция — «либо купили всё, либо ничего».

## Основная теория по шагам

### Шаг 1. Что уже есть в EF Core

- `DbSet<T>` — это и есть репозиторий: коллекция сущностей с добавлением (`Add`), удалением (`Remove`), поиском (`Find`) и запросами (`IQueryable<T>`).
- `DbContext` — это Unit of Work: копит изменения в трекере и сохраняет их в одной транзакции через `SaveChanges` (подробно — в теме про [change tracking](#p3-tracking)).

Поэтому «репозиторий + UoW поверх EF» — это обёртка над готовой реализацией этих же паттернов. Спрашивай себя не «как принято», а «какую проблему решает моя обёртка».

### Шаг 2. Антипаттерн: generic-репозиторий «для галочки»

~~~csharp ❌ @nocheck
public interface IRepository<T>
{
    T? GetById(int id);
    IEnumerable<T> GetAll();      // загружает ВСЮ таблицу, фильтр — уже в памяти
    void Add(T entity);
    void Save();
}
~~~

Какие у него проблемы:

1. `GetAll()` возвращает `IEnumerable<T>` — таблица загружается целиком, а `Where`, сортировка и пагинация происходят **в памяти**.
2. Нет `Include`, проекций, `AsNoTracking`, асинхронности и всего остального, ради чего берут EF.
3. Если каждый репозиторий вызывает `Save()` сам, ломается единица работы: изменения в нескольких репозиториях применяются раздельно.
4. Если вернуть `IQueryable<T>`, абстракция «протекает»: вызывающий код всё равно пишет EF-совместимые LINQ-запросы, и подменить хранилище так же не выйдет.

Первую проблему можно увидеть в числах. Смоделируем «таблицу» из 20 000 выдач, каждая сотая — просрочена, и посчитаем, сколько строк уходит по сети в каждом варианте:

~~~csharp
var table = new Table(20_000);

var bad = new GenericRepository(table);
var overdueSlow = bad.GetAll().Where(l => l.Overdue).Take(10).ToList();          // фильтр уже в памяти
Console.WriteLine($"GetAll + Where в памяти: найдено {overdueSlow.Count}, передано строк {table.Transferred}");

table.Transferred = 0;
var good = new LoanRepository(table);
var overdueFast = good.GetOverdue(10);                                           // фильтр на стороне «базы»
Console.WriteLine($"GetOverdue (доменный метод): найдено {overdueFast.Count}, передано строк {table.Transferred}");

record Loan(int Id, bool Overdue);

class Table
{
    public int Transferred;
    readonly List<Loan> _rows;
    public Table(int n) => _rows = Enumerable.Range(1, n).Select(i => new Loan(i, i % 100 == 0)).ToList();
    public List<Loan> ReadAll() { Transferred += _rows.Count; return _rows.ToList(); }           // как SELECT * без WHERE
    public List<Loan> Select(Func<Loan, bool> where, int take)                                   // как SELECT ... WHERE ... LIMIT
    {
        var result = _rows.Where(where).Take(take).ToList();
        Transferred += result.Count;
        return result;
    }
}

class GenericRepository(Table t) { public IEnumerable<Loan> GetAll() => t.ReadAll(); }
class LoanRepository(Table t) { public List<Loan> GetOverdue(int take) => t.Select(l => l.Overdue, take); }
~~~
~~~console
GetAll + Where в памяти: найдено 10, передано строк 20000
GetOverdue (доменный метод): найдено 10, передано строк 10
~~~

Одинаковый результат, но «универсальный» вариант тащит по сети 20 000 строк ради десяти нужных. Разница растёт вместе с таблицей.

### Шаг 3. Unit of Work: почему Save() внутри репозитория ломает атомарность

Второй недостаток проявляется при ошибке на середине операции. Пусть выдача книги состоит из двух шагов: записать выдачу и обновить читателя, и второй шаг падает.

~~~csharp
// Вариант 1: каждый «репозиторий» сохраняет сразу
var store1 = new Store();
try { store1.Apply("INSERT loan"); store1.Apply("UPDATE reader FAIL"); }
catch (InvalidOperationException ex) { Console.WriteLine("ошибка: " + ex.Message); }
Console.WriteLine($"без Unit of Work в хранилище: [{string.Join(", ", store1.Committed)}]");

// Вариант 2: изменения копятся и применяются одной транзакцией
var store2 = new Store();
var uow = new UnitOfWork(store2);
uow.Add("INSERT loan");
uow.Add("UPDATE reader FAIL");
try { uow.Commit(); }
catch (InvalidOperationException ex) { Console.WriteLine("ошибка: " + ex.Message); }
Console.WriteLine($"с Unit of Work в хранилище:    [{string.Join(", ", store2.Committed)}]");

class Store
{
    public List<string> Committed { get; } = new();
    public void Apply(string op)
    {
        if (op.Contains("FAIL")) throw new InvalidOperationException(op);
        Committed.Add(op);
    }
}

class UnitOfWork(Store store)
{
    readonly List<string> _pending = new();
    public void Add(string op) => _pending.Add(op);
    public void Commit()
    {
        var backup = store.Committed.ToList();
        try { foreach (var op in _pending) store.Apply(op); }
        catch { store.Committed.Clear(); store.Committed.AddRange(backup); throw; }   // откат
        _pending.Clear();
    }
}
~~~
~~~console
ошибка: UPDATE reader FAIL
без Unit of Work в хранилище: [INSERT loan]
ошибка: UPDATE reader FAIL
с Unit of Work в хранилище:    []
~~~

В первом варианте выдача записана, а читатель не обновлён — данные противоречивы. Во втором — ничего не изменилось. `DbContext.SaveChanges()` работает именно по второму сценарию (с реальной транзакцией в базе, а не с ручным откатом, как в этой модели). Значит, **единицу работы не нужно изобретать: она уже есть, достаточно один раз вызвать `SaveChanges` в конце операции**.

### Шаг 4. Когда репозиторий оправдан

~~~csharp ✅ Репозиторий с методами предметной области @nocheck
public interface ILoanRepository
{
    Loan? FindActive(int bookId, int readerId);
    IReadOnlyList<OverdueLoanDto> GetOverdue(DateOnly today, int page, int pageSize);
    int CountOnHand(int readerId);
    void Add(Loan loan);
}

public sealed record OverdueLoanDto(string Reader, string Title, DateOnly DueAt, int DaysLate);
~~~

Методы называются языком предметной области и инкапсулируют **конкретные** запросы. Каждому из них соответствует один продуманный SQL. Например, `GetOverdue` (проверим на учебных данных, «сегодня» — 28 октября 2026):

~~~sql
SELECT r."FullName" AS reader, b."Title", l."DueAt", (DATE '2026-10-28' - l."DueAt") AS days_late
FROM "Loans" AS l
JOIN "Books"   AS b ON b."Id" = l."BookId"
JOIN "Readers" AS r ON r."Id" = l."ReaderId"
WHERE l."ReturnedAt" IS NULL AND l."DueAt" < DATE '2026-10-28'
ORDER BY days_late DESC, l."Id"
LIMIT 10 OFFSET 0;
~~~
~~~console
    reader     |          Title           |   DueAt    | days_late 
---------------+--------------------------+------------+-----------
 Анна Иванова  | Преступление и наказание | 2026-10-04 |        24
 Вера Смирнова | Мастер и Маргарита       | 2026-10-16 |        12
(2 rows)
~~~

А `CountOnHand` — это небольшой запрос с агрегатом, выполняемый на стороне базы:

~~~sql
SELECT count(*) AS on_hand FROM "Loans" WHERE "ReaderId" = 1 AND "ReturnedAt" IS NULL;
~~~
~~~console
 on_hand 
---------
       1
(1 row)
~~~

Репозиторий с такими методами полезен, когда:

- одни и те же сложные запросы повторяются в разных местах — правило формулируется в одном месте;
- нужно подменять хранилище в unit-тестах бизнес-логики (Фаза 5);
- команда договорилась о слоистой архитектуре, где домен не зависит от EF (Фаза 4).

Выгоду для тестов видно на примере: бизнес-правило «не больше трёх книг на руках» проверяется без базы, если сервис зависит от узкого интерфейса.

~~~csharp
ILoanRepository repo = new InMemoryLoanRepository(onHand: new() { [1] = 3, [2] = 1 });
var service = new LoanService(repo);

Console.WriteLine("читатель 1 (3 книги на руках): " + service.Issue(readerId: 1, bookId: 10));
Console.WriteLine("читатель 2 (1 книга на руках):  " + service.Issue(readerId: 2, bookId: 10));

interface ILoanRepository
{
    int CountOnHand(int readerId);
    void Add(int readerId, int bookId);
}

class LoanService(ILoanRepository repo)
{
    const int Limit = 3;
    public string Issue(int readerId, int bookId)
    {
        if (repo.CountOnHand(readerId) >= Limit) return $"отказ: лимит {Limit} книги";
        repo.Add(readerId, bookId);
        return "выдано";
    }
}

class InMemoryLoanRepository(Dictionary<int, int> onHand) : ILoanRepository
{
    public int CountOnHand(int readerId) => onHand.GetValueOrDefault(readerId);
    public void Add(int readerId, int bookId) => onHand[readerId] = CountOnHand(readerId) + 1;
}
~~~
~~~console
читатель 1 (3 книги на руках): отказ: лимит 3 книги
читатель 2 (1 книга на руках):  выдано
~~~

Правило протестировано без базы, за миллисекунды. Но обрати внимание: такой подход оправдан, пока правило действительно содержит логику. Если «сервис» только проксирует вызовы, тестировать нечего.

### Шаг 5. Практическое решение для твоих проектов

| Ситуация | Решение |
|---|---|
| Консольный проект этой фазы | `DbContext` напрямую в сервисах — просто и честно |
| API Фазы 4 | сервисы используют `DbContext` или узкие репозитории с доменными методами; `SaveChanges` вызывает сервис один раз |
| Тестирование бизнес-логики | интеграционные тесты с настоящей БД (Фаза 5) часто лучше, чем моки репозиториев |
| Сложные повторяющиеся запросы | выделенный репозиторий/«query object» с доменными методами |
| Несколько разных хранилищ | абстракция оправдана: у каждого свой адаптер |

:::key Главное
Паттерн — ответ на конкретную проблему. Если ты не можешь назвать проблему, которую решает `IRepository<T>` в твоём проекте, — не добавляй его.
:::

### Шаг 6. Как выглядит «сервис напрямую с DbContext»

~~~csharp @nocheck
public class LoanService(LibraryContext db)
{
    public async Task<string> IssueAsync(int readerId, int bookId, CancellationToken ct)
    {
        var onHand = await db.Loans.CountAsync(l => l.ReaderId == readerId && l.ReturnedAt == null, ct);
        if (onHand >= 3) return "отказ: лимит 3 книги";

        db.Loans.Add(new Loan { ReaderId = readerId, BookId = bookId, LoanedAt = DateOnly.FromDateTime(DateTime.Today) });
        await db.SaveChangesAsync(ct);         // единица работы: один вызов в конце
        return "выдано";
    }
}
~~~

Все возможности EF на месте, зависимость явная, кода меньше. Расплата — сервис знает про EF; тестировать его удобнее интеграционно (настоящая PostgreSQL в контейнере, Фаза 5), чем подменять `DbContext` моками. Многие команды сознательно выбирают этот вариант.

### Шаг 7. Как принять решение на своём проекте

Задай себе четыре вопроса по порядку:

1. **Есть ли запрос, который повторяется в трёх и более местах?** Если нет — отдельная абстракция не нужна, оставь запрос там, где он используется.
2. **Нужно ли изолировать домен от EF** (по требованиям архитектуры или потому, что хранилищ может быть несколько)? Если да — репозиторий с доменными методами, интерфейс в слое домена, реализация в слое инфраструктуры.
3. **Можно ли протестировать правило интеграционным тестом?** Если да, мок репозитория не нужен.
4. **Кто будет это читать?** Новому разработчику проще понять сервис, который напрямую делает `db.Loans.Where(...)`, чем цепочку из контроллера, сервиса, репозитория и «спецификации».

Начинай с простого: `DbContext` в сервисе. Выделяй репозиторий позже, когда появилась реальная боль: дублирование запросов или сложность тестов. Рефакторинг от простого к сложному дешёвый, обратный — дорогой.

## Как это работает под капотом

- **`DbSet<T>` как репозиторий.** Он реализует `IQueryable<T>`, поэтому `db.Books.Where(...)` — это построение запроса (дерево выражений), а не работа с коллекцией в памяти. Это важное отличие от «репозитория со списком».
- **`DbContext` как UoW.** Хранит трекер изменений; `SaveChanges` отправляет все накопленные команды в одной транзакции (см. [Change tracking](#p3-tracking)). Поэтому несколько репозиториев, использующих **один и тот же экземпляр** `DbContext`, уже делят единицу работы.
- **Время жизни.** В ASP.NET Core `DbContext` регистрируется как `Scoped`; репозитории и сервисы — тоже `Scoped`, чтобы получить один экземпляр на запрос. Если репозиторий — `Singleton`, а контекст — `Scoped`, получишь ошибку захвата зависимостей.
- **Утечка абстракции.** Репозиторий, возвращающий `IQueryable<T>`, привязывает вызывающий код к возможностям провайдера (какие методы переводятся в SQL, а какие нет). Репозиторий, возвращающий готовые списки и DTO, прячет это, но теряет гибкость.
- **Тестирование.** In-memory провайдер EF и SQLite-in-memory не воспроизводят особенности PostgreSQL (ограничения, поведение коллаций, `jsonb`). Для уверенности тестируй на настоящей СУБД (Testcontainers, Фаза 5).
- **Паттерны по уровням.** Query object («объект запроса»), спецификация, CQRS-обработчики — более современные способы упаковать запросы, чем универсальный `IRepository<T>`; общий принцип тот же: имя метода говорит о бизнес-смысле.

## Типичные ошибки и ловушки

- **`IRepository<T>` на каждую сущность «по умолчанию».** Дублирует `DbSet`, прячет возможности EF и не решает ни одной реальной проблемы.
- **`GetAll()` + фильтрация в памяти.** Вся таблица едет в приложение.
- **`Save()` внутри каждого репозитория.** Ломается атомарность составных операций.
- **Два разных `DbContext` в одной операции.** Нет общей транзакции и общего трекера — «единица работы» только по названию.
- **Репозиторий, возвращающий `IQueryable`, «чтобы было гибко».** Логика запроса расползается по всему коду, а тестирование с моками не повторяет настоящий SQL.
- **Мок `DbContext`/`DbSet` в тестах.** Хрупко и не проверяет реальный SQL; лучше интеграционные тесты.
- **Слой ради слоя.** Репозиторий, в котором каждый метод — однострочный вызов `_db.Set<T>()`.
- **Игнорирование асинхронности.** Репозитории с синхронными методами в веб-API блокируют потоки.
- **Смешение ролей.** Репозиторий, который ещё и отправляет письма или считает бизнес-правила, — не репозиторий.

## Вопросы с собеседований

:::spoiler Почему generic `IRepository<T>` с `GetAll()` поверх EF Core считают антипаттерном?
Он дублирует то, что уже дают `DbSet` и `DbContext`, при этом прячет возможности EF (IQueryable, Include, проекции), подталкивает к загрузке всей таблицы в память и ломает единицу работы, если каждый репозиторий сохраняет сам.
:::

:::spoiler Когда репозиторий поверх EF всё-таки полезен?
Когда он предоставляет методы предметной области (`GetOverdue`, `CountOnHand`), инкапсулирует сложные повторяющиеся запросы и позволяет изолировать бизнес-логику от EF.
:::

:::spoiler Что такое Unit of Work, и есть ли он в EF Core? (ловушка: «нужно писать самому»)
Паттерн, который накапливает изменения и применяет их одной транзакцией. В EF Core он уже есть: `DbContext` (трекер изменений + `SaveChanges`).
:::

:::spoiler Что лучше возвращать из репозитория: IQueryable или готовый список?
`IQueryable` даёт гибкость, но «протекает»: вызывающий код пишет EF-запросы и зависит от провайдера. Готовые списки/DTO скрывают детали, но требуют методов под каждый сценарий. Для доменных методов обычно возвращают готовые результаты.
:::

:::spoiler Как тестировать бизнес-логику, использующую EF Core?
Либо с узким интерфейсом репозитория и заглушкой (для чистой логики), либо интеграционными тестами с настоящей БД (надёжнее). Mock `DbContext` обычно не рекомендуется.
:::

:::spoiler Какое время жизни у DbContext и репозиториев в ASP.NET Core?
`Scoped`: один экземпляр на HTTP-запрос. Репозитории, использующие контекст, тоже `Scoped`; `Singleton` с контекстом внутри — ошибка.
:::

:::spoiler Как бы ты ответил на вопрос «нужен ли репозиторий поверх EF Core?»
«Не по умолчанию: `DbSet` и `DbContext` уже реализуют репозиторий и Unit of Work. Репозиторий добавляю, когда есть конкретная причина: повторяющиеся сложные запросы, доменные методы, изоляция домена от EF или требования архитектуры».
:::

## Что запомнить

- `DbSet<T>` = репозиторий, `DbContext` = Unit of Work; обёртка поверх них — не обязанность.
- Универсальный `IRepository<T>` с `GetAll()` загружает всё в память, прячет возможности EF и ломает атомарность, если сохраняет сам.
- Оправданный репозиторий — с методами предметной области, инкапсулирующий конкретные запросы.
- `SaveChanges` вызывается один раз в конце операции — это и есть единица работы.
- Для тестов логики — узкий интерфейс; для уверенности в SQL — интеграционные тесты с настоящей БД.
- Паттерн — ответ на проблему; не можешь её назвать — не добавляй.

## Практика

- [ ] Написал `ILoanRepository` с тремя доменными методами и реализацией на EF Core
- [ ] Сравнил с вариантом «сервис использует `DbContext` напрямую» и записал, что выбираешь для проекта и почему

