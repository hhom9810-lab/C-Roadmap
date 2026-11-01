@@append id="p3-select"
## Закрепление {#lab}

:::quiz SELECT и основы SQL
? В каком порядке СУБД логически выполняет части запроса? #sql
- SELECT → FROM → WHERE
+ FROM → WHERE → GROUP BY → HAVING → SELECT → ORDER BY
- WHERE → FROM → SELECT
- SELECT → WHERE → FROM → ORDER BY
= Поэтому в `WHERE` нельзя использовать алиас, объявленный в `SELECT`: к моменту фильтрации он ещё не вычислен.

? Что вернёт `WHERE price = NULL`? #sql
- Строки, где цена не задана
+ Ни одной строки: сравнение с NULL даёт UNKNOWN. Нужно `IS NULL`
- Все строки
- Ошибку синтаксиса
= NULL — «неизвестно», а не значение. `NULL = NULL` тоже не истина.

? Чем `WHERE` отличается от `HAVING`? #sql
+ `WHERE` фильтрует строки до группировки, `HAVING` — группы после агрегации
- Ничем
- `HAVING` быстрее
- `WHERE` работает только с числами
= `HAVING COUNT(*) > 5` — условие на агрегат; в `WHERE` агрегат использовать нельзя.

? Почему `SELECT *` в боевом коде считается плохой практикой? #sql
+ Тянет лишние столбцы, ломает код при изменении схемы и мешает покрывающим индексам
- Он запрещён стандартом
- Он медленнее на пустых таблицах
- Он не работает с JOIN
= Явно перечисляй нужные столбцы — меньше трафика, понятнее контракт.
:::

:::cards SELECT
Порядок выполнения :: FROM → WHERE → GROUP BY → HAVING → SELECT → ORDER BY → LIMIT.
NULL :: Неизвестное значение; сравнение только через IS NULL / IS NOT NULL.
WHERE vs HAVING :: WHERE фильтрует строки, HAVING — группы после агрегации.
:::


@@append id="p3-joins"
## Закрепление {#lab}

:::quiz JOIN
? Чем `LEFT JOIN` отличается от `INNER JOIN`? #sql
+ LEFT сохраняет все строки левой таблицы (без пары — NULL справа); INNER оставляет только совпавшие
- LEFT быстрее
- INNER сохраняет строки обеих таблиц
- Ничем
= «Покажи всех клиентов, даже без заказов» — это LEFT JOIN.

? Что случится, если в `LEFT JOIN` поставить условие по правой таблице в `WHERE`? #sql
| SELECT c.Name FROM Customers c
| LEFT JOIN Orders o ON o.CustomerId = c.Id
| WHERE o.Total > 100
- Вернутся клиенты без заказов
+ LEFT JOIN превратится в INNER: строки с NULL справа отфильтруются условием
- Запрос не выполнится
- Вернутся только клиенты с заказами меньше 100
= Условия по правой таблице кладут в `ON`, если нужно сохранить левые строки без пары.

? Сколько строк даст соединение 3 клиентов × 2 заказа у каждого (INNER по CustomerId)? #sql
- 3
+ 6
- 5
- 2
= Каждый заказ порождает строку результата. Забытое условие `ON` даст декартово произведение.

? Как найти клиентов без единого заказа? #sql
+ LEFT JOIN Orders и `WHERE o.Id IS NULL` (или `NOT EXISTS`)
- INNER JOIN и `WHERE o.Id = 0`
- GROUP BY без агрегатов
- UNION
= Анти-соединение — частый приём.
:::

:::compare Условие в ON против WHERE
@intro Нужны все клиенты и сумма их крупных заказов (> 100), клиент без крупных заказов остаётся в списке.
@bad
~~~sql
SELECT c.Name, o.Total
FROM Customers c
LEFT JOIN Orders o ON o.CustomerId = c.Id
WHERE o.Total > 100;
~~~
@badwhy
Условие в `WHERE` отфильтровало строки с `NULL` — клиенты без крупных заказов пропали, `LEFT JOIN` стал `INNER JOIN`.
@good
~~~sql
SELECT c.Name, o.Total
FROM Customers c
LEFT JOIN Orders o ON o.CustomerId = c.Id AND o.Total > 100;
~~~
@goodwhy
Условие соединения — в `ON`: клиент остаётся, а `Total` у него будет `NULL`, если крупных заказов нет.
:::

:::cards JOIN
INNER JOIN :: Только строки с парой в обеих таблицах.
LEFT JOIN :: Все строки левой; без пары справа — NULL.
Условие в ON vs WHERE :: В LEFT JOIN условие по правой таблице в WHERE «убивает» левые строки без пары.
:::


@@append id="p3-grouping"
## Закрепление {#lab}

:::quiz GROUP BY, подзапросы, CTE, окна
? Что неверно в запросе? #sql
| SELECT Department, Name, COUNT(*) FROM Employees GROUP BY Department
+ `Name` не входит в GROUP BY и не агрегирован — запрос недопустим
- COUNT нельзя использовать с GROUP BY
- Нельзя группировать по строке
- Всё верно
= Каждый столбец в SELECT — либо в GROUP BY, либо внутри агрегата.

? Чем оконная функция `ROW_NUMBER() OVER (...)` отличается от `GROUP BY`? #sql
+ Не схлопывает строки: каждая остаётся в результате, добавляется вычисленный столбец
- Работает только с числами
- Требует CTE
- Ничем
= Окна — для «топ-N в группе», нарастающих итогов, сравнения с предыдущей строкой.

? Для чего чаще всего используют CTE (`WITH`)? #sql
+ Чтобы разбить сложный запрос на читаемые именованные шаги
- Чтобы ускорить любой запрос
- Чтобы создавать таблицы
- Чтобы обойти индексы
= CTE — про читаемость (и рекурсию); скорость зависит от плана.

? Что делает `COUNT(column)` в отличие от `COUNT(*)`? #sql
+ Считает только строки, где column не NULL
- Считает уникальные значения
- Тоже самое
- Бросает ошибку на NULL
= Тонкость, на которой любят ловить на собеседованиях.
:::

:::cards Группировка
GROUP BY правило :: Любой столбец SELECT — в GROUP BY или внутри агрегата.
COUNT(*) vs COUNT(col) :: COUNT(*) считает строки; COUNT(col) — только не NULL.
Оконные функции :: Считают по окну строк, не схлопывая результат: ROW_NUMBER, RANK, SUM() OVER.
:::


@@append id="p3-design"
## Закрепление {#lab}

:::quiz Нормализация
? Таблица `Orders(Id, CustomerName, CustomerCity, Product)` хранит имя и город клиента в каждой строке заказа. Что это нарушает? #sql
+ 3НФ/2НФ: атрибуты клиента зависят не от заказа, а от клиента — их надо вынести в `Customers`
- 1НФ
- Ничего, это нормально
- Правило первичного ключа
= Дублирование приводит к аномалиям обновления: сменил город в одной строке — в остальных старый.

? Что нарушает 1НФ? #sql
+ Столбец `Phones` со значением «123, 456» (несколько значений в ячейке)
- Использование внешнего ключа
- Наличие индекса
- Столбец NULL
= 1НФ: атомарные значения в ячейках.

? Когда оправдана денормализация? #sql
+ Когда доказано измерениями, что JOIN-ы — узкое место чтения, и цена дублирования данных приемлема
- Всегда, чтобы было быстрее
- Никогда
- Если лень писать JOIN
= Сначала нормализуй, потом осознанно денормализуй по метрикам.
:::

:::cards Схема
1НФ :: Атомарные значения, без повторяющихся групп.
2НФ :: 1НФ + нет частичных зависимостей от составного ключа.
3НФ :: 2НФ + нет транзитивных зависимостей между неключевыми столбцами.
:::


@@append id="p3-indexes"
## Закрепление {#lab}

:::quiz Индексы
? Почему запрос `WHERE LOWER(Email) = 'a@b.ru'` может не использовать обычный индекс по `Email`? #sql
+ Функция над столбцом мешает использовать индекс (нужен функциональный индекс или нормализованное значение)
- Индекс работает только с числами
- LOWER запрещён
- Индекс устарел
= Не оборачивай индексируемый столбец в функцию в условии.

? Что делает составной индекс `(A, B)` полезным? #sql
+ Он помогает запросам по A и по A+B, но обычно не помогает запросу только по B (правило левого префикса)
- Работает для любого из столбцов независимо
- Работает только для B
- Заменяет первичный ключ
= Порядок столбцов в индексе — принципиален.

? Какова цена индекса? #sql
+ Место на диске и замедление INSERT/UPDATE/DELETE: индекс надо обновлять
- Никакой
- Только место в памяти приложения
- Замедление SELECT
= Индексы не бесплатны — ставь под реальные запросы.

? Как понять, использует ли запрос индекс? #sql
+ `EXPLAIN` / `EXPLAIN ANALYZE` — смотреть план (Index Scan vs Seq Scan)
- Запустить и посмотреть на скорость
- Прочитать код индекса
- Никак
= Планы запросов — главный инструмент диагностики.
:::

:::cards Индексы
B-tree :: Индекс по умолчанию; ускоряет равенство, диапазоны, сортировку.
Левый префикс :: Составной индекс (A,B) работает для A и (A,B), но не для одного B.
Цена индекса :: Память + замедление записи; создавай под реальные запросы, проверяй EXPLAIN.
:::


@@append id="p3-transactions"
## Закрепление {#lab}

:::quiz Транзакции
? Что гарантирует «A» в ACID? #sql
+ Атомарность: транзакция выполняется целиком или не выполняется вовсе
- Скорость
- Доступность
- Авторизацию
= Перевод денег: списание и зачисление — либо обе операции, либо ни одной.

? Что такое «грязное чтение»? #sql
+ Чтение данных, которые другая транзакция изменила, но ещё не зафиксировала
- Чтение повреждённого диска
- Чтение без индекса
- Чтение из кэша
= Уровень Read Committed (по умолчанию в PostgreSQL) защищает от него.

? Два пользователя одновременно покупают последний билет. Что поможет? #sql
+ Блокировка строки (`SELECT ... FOR UPDATE`), оптимистичная конкурентность (версия строки) или атомарный `UPDATE ... WHERE stock > 0`
- Ничего, СУБД сама разберётся
- Увеличить размер пула соединений
- Добавить индекс
= Проверка «прочитал → решил → записал» без защиты — классическая гонка.
:::

:::cards Транзакции
ACID :: Атомарность, Согласованность, Изолированность, Долговечность.
Read Committed :: Видны только зафиксированные данные; не защищает от неповторяющегося чтения.
Оптимистичная блокировка :: Версия строки: при конфликте SaveChanges бросает исключение, а не затирает чужие данные.
:::


@@append id="p3-efcore"
## Закрепление {#lab}

:::quiz EF Core
? Какое время жизни у `DbContext` в веб-приложении? #net
+ Scoped: один контекст на HTTP-запрос
- Singleton на всё приложение
- Transient на каждое обращение
- Не важно
= `DbContext` не потокобезопасен и накапливает отслеживаемые сущности — делать его синглтоном нельзя.

? Что делает `AsNoTracking()`? #net
+ Отключает отслеживание изменений для запроса — быстрее и меньше памяти для чтения
- Отключает кэш
- Запрещает изменения БД
- Включает пакетную загрузку
= Для read-only запросов — почти всегда хорошая идея.
:::

:::cards EF Core
DbContext :: Единица работы + шлюз к БД; Scoped, не потокобезопасен.
AsNoTracking :: Запрос без отслеживания: быстрее для чтения.
Code First :: Схема БД описывается классами и миграциями.
:::


@@append id="p3-migrations"
## Закрепление {#lab}

:::quiz Миграции
? Что хранит таблица `__EFMigrationsHistory`? #net
+ Список применённых миграций
- Копию схемы
- Пользователей
- Логи запросов
= По ней EF понимает, какие миграции ещё нужно применить.

? Что нельзя делать с уже применённой на общем окружении миграцией? #net
+ Править её задним числом — создаётся новая миграция
- Хранить в git
- Откатывать
- Применять
= История схемы неизменяема — как история коммитов в общей ветке.
:::


@@append id="p3-tracking"
## Закрепление {#lab}

:::quiz Change tracking
? Что произойдёт? #net
| var user = await db.Users.FirstAsync(u => u.Id == 1);
| user.Name = "Новое";
| await db.SaveChangesAsync();
+ EF заметит изменение и выполнит UPDATE
- Ничего: нужен явный Update()
- Исключение
- Вставится новая строка
= Отслеживаемая сущность сравнивается со снимком при SaveChanges.

? Почему не стоит использовать один `DbContext` для долгого процесса? #net
+ Он накапливает отслеживаемые сущности (память) и держит устаревшие данные
- Он падает через час
- Блокирует таблицы
- Не поддерживает транзакции
= Контекст — короткоживущая единица работы.

? Какие состояния бывают у сущности в EF? #net
+ Detached, Unchanged, Added, Modified, Deleted
- Open, Closed
- Active, Passive
- New, Old
= SaveChanges обрабатывает Added/Modified/Deleted.
:::

:::cards Tracking
Снимок (snapshot) :: EF хранит оригинальные значения и сравнивает при SaveChanges.
Состояния сущности :: Detached, Unchanged, Added, Modified, Deleted.
SaveChanges :: Одна транзакция на все накопленные изменения.
:::


@@append id="p3-relations"
## Закрепление {#lab}

:::quiz Связи
? Как в EF Core выразить «один автор — много книг»? #net
+ `Author` с `List<Book> Books` и `Book` с `AuthorId` + навигацией `Author` (внешний ключ на стороне «многие»)
- Столбец со списком id в Author
- Две независимые таблицы без связи
- Только через строку
= Внешний ключ всегда на стороне «многие».

? Как реализуется связь «многие-ко-многим» в БД? #sql
+ Через промежуточную (связующую) таблицу с двумя внешними ключами
- Одним столбцом-массивом
- Нельзя реализовать
- Через индекс
= EF Core может скрыть связующую таблицу (skip navigations).
:::


@@append id="p3-loading"
## Закрепление {#lab}

:::quiz Загрузка данных и N+1
? Что такое проблема N+1? #net
+ 1 запрос за списком + N запросов за связанными данными для каждого элемента — вместо одного-двух запросов
- N запросов на одну таблицу
- Ошибка индекса
- Дублирование строк
= 100 заказов → 101 запрос. Лечится `Include` / проекцией / пакетной загрузкой.

? Чем `Include` отличается от проекции `Select(x => new Dto { ... })`? #net
+ Include грузит сущности целиком, проекция выбирает только нужные столбцы — меньше данных
- Одинаковы
- Проекция медленнее всегда
- Include не умеет JOIN
= Для API часто лучше проекция в DTO.

? Что такое «картезианский взрыв» при Include нескольких коллекций? #net
+ Результирующий набор перемножается: строк становится A×B, трафик растёт; помогает `AsSplitQuery`
- Ошибка компиляции
- Индексы разрушаются
- Потеря данных
= Следи за количеством строк в логах SQL.
:::

:::ticket N+1 при подсчёте книг
@key DB-77
@type Bug
@prio High
@reporter Лена (продакт)
@labels EF Core, производительность, N+1
@xp 100
@task
`BookCounts(db)` возвращает имя автора и число его книг. На 500 авторах страница отчёта грузится 6 секунд: в логе — по запросу на каждого автора.

**Нужно:** ровно **2 запроса** к базе (авторы + книги всех авторов одним запросом), результат тот же — включая авторов без книг (у них `0`).
@comment Лена: В логе SQL 501 запрос подряд. Пожалуйста, без «оптимизации» в виде кэша на час.
@code
~~~csharp
using System;
using System.Collections.Generic;
using System.Linq;

public record Author(int Id, string Name);
public record Book(int Id, int AuthorId, string Title);

public class FakeDb
{
    public int Queries;
    private readonly List<Author> _authors = new List<Author>
    {
        new Author(1, "Толстой"), new Author(2, "Чехов"), new Author(3, "Новичок")
    };
    private readonly List<Book> _books = new List<Book>
    {
        new Book(1, 1, "Война и мир"), new Book(2, 1, "Анна Каренина"),
        new Book(3, 2, "Вишнёвый сад"), new Book(4, 2, "Палата №6"), new Book(5, 2, "Дама с собачкой")
    };

    public List<Author> GetAuthors() { Queries++; return new List<Author>(_authors); }
    public List<Book> GetBooksByAuthor(int id) { Queries++; return _books.Where(b => b.AuthorId == id).ToList(); }
    public List<Book> GetBooksByAuthors(List<int> ids) { Queries++; return _books.Where(b => ids.Contains(b.AuthorId)).ToList(); }
}

public static class Solver
{
    public static Dictionary<string, int> BookCounts(FakeDb db)
    {
        var res = new Dictionary<string, int>();
        foreach (var a in db.GetAuthors())
            res[a.Name] = db.GetBooksByAuthor(a.Id).Count;
        return res;
    }
}
~~~
@tests
~~~csharp
class T
{
    public static void Run()
    {
        var db = new FakeDb();
        var r = Solver.BookCounts(db);
        Assert.Equal(2, r["Толстой"], "Толстой: 2 книги");
        Assert.Equal(3, r["Чехов"], "Чехов: 3 книги");
        Assert.Equal(0, r["Новичок"], "автор без книг");
        Assert.Equal(2, db.Queries, "ровно два запроса к базе");
    }
}
~~~
@hint
Сначала `GetAuthors()`, затем одним вызовом `GetBooksByAuthors(ids)`. Сгруппируй книги по `AuthorId` в словарь и для каждого автора бери значение (или 0).
@solution
~~~csharp
using System;
using System.Collections.Generic;
using System.Linq;

public record Author(int Id, string Name);
public record Book(int Id, int AuthorId, string Title);

public class FakeDb
{
    public int Queries;
    private readonly List<Author> _authors = new List<Author>
    {
        new Author(1, "Толстой"), new Author(2, "Чехов"), new Author(3, "Новичок")
    };
    private readonly List<Book> _books = new List<Book>
    {
        new Book(1, 1, "Война и мир"), new Book(2, 1, "Анна Каренина"),
        new Book(3, 2, "Вишнёвый сад"), new Book(4, 2, "Палата №6"), new Book(5, 2, "Дама с собачкой")
    };

    public List<Author> GetAuthors() { Queries++; return new List<Author>(_authors); }
    public List<Book> GetBooksByAuthor(int id) { Queries++; return _books.Where(b => b.AuthorId == id).ToList(); }
    public List<Book> GetBooksByAuthors(List<int> ids) { Queries++; return _books.Where(b => ids.Contains(b.AuthorId)).ToList(); }
}

public static class Solver
{
    public static Dictionary<string, int> BookCounts(FakeDb db)
    {
        var authors = db.GetAuthors();
        var books = db.GetBooksByAuthors(authors.Select(a => a.Id).ToList());
        var perAuthor = books.GroupBy(b => b.AuthorId).ToDictionary(g => g.Key, g => g.Count());

        var res = new Dictionary<string, int>();
        foreach (var a in authors)
            res[a.Name] = perAuthor.TryGetValue(a.Id, out var n) ? n : 0;
        return res;
    }
}
~~~
@why
Число запросов не должно зависеть от количества записей. Здесь мы вручную сделали то, что EF делает через `Include` или проекцию: один запрос за родителями + один за всеми детьми. В реальном проекте считай количество SQL в логах или в тестах.
:::

:::cards N+1
N+1 :: 1 запрос за списком + N запросов за связанными; лечится Include / проекцией / пакетной загрузкой.
Include vs Select :: Include — сущности целиком; Select в DTO — только нужные столбцы.
AsSplitQuery :: Разделяет запрос при Include коллекций, чтобы избежать картезианского взрыва.
:::


@@append id="p3-repository"
## Закрепление {#lab}

:::quiz Repository и Unit of Work
? Почему `DbContext` уже реализует паттерны Repository и Unit of Work? #net
+ `DbSet<T>` — репозиторий, а `SaveChanges` фиксирует всё одной единицей работы
- Не реализует
- Только Unit of Work
- Только Repository
= Поэтому обёртка «репозиторий над DbSet» часто просто дублирует API без пользы.

? Когда отдельный репозиторий всё же оправдан? #net
+ Когда нужно изолировать сложные запросы, скрыть источник данных или упростить тестирование доменной логики
- Всегда
- Никогда
- Только в маленьких проектах
= Не добавляй слой «потому что так принято».
:::

:::cards Repository
DbSet<T> :: Уже репозиторий; DbContext — Unit of Work.
Когда нужен Repository :: Сложные запросы в одном месте, подмена источника данных в тестах.
Анти-паттерн :: Универсальный Repository<T> с методами GetAll(), возвращающими IQueryable наружу.
:::


@@append id="p3-project"
## Код-ревью: сервис библиотеки {#lab}

:::legacy BookService на EF Core
@context Страница «Каталог» грузится целую минуту, а при одновременной выдаче книг иногда остаются «выданные» книги без записи о выдаче.
@code
~~~csharp
public class BookService
{
    private readonly LibraryContext db = new LibraryContext();

    public List<BookDto> GetAll()
    {
        var books = db.Books.ToList();
        var result = new List<BookDto>();
        foreach (var b in books)
        {
            var author = db.Authors.First(a => a.Id == b.AuthorId);
            result.Add(new BookDto { Title = b.Title, Author = author.Name });
        }
        return result;
    }

    public void Borrow(int bookId, int userId)
    {
        var book = db.Books.Find(bookId);
        book.IsBorrowed = true;
        db.SaveChanges();
        db.Loans.Add(new Loan { BookId = bookId, UserId = userId });
        db.SaveChanges();
    }
}
~~~
@bug 3 | [design] `DbContext` создаётся через `new` и живёт всю жизнь сервиса | Контекст не потокобезопасен и накапливает отслеживаемые сущности: при singleton-сервисе — гонки и утечка памяти. Контекст нужно получать через DI (Scoped).
@bug 7-12 | [perf] N+1 запросов и загрузка целых сущностей | Для каждой книги выполняется запрос за автором, а `ToList()` ещё и тянет все столбцы с отслеживанием. Нужна проекция: `db.Books.AsNoTracking().Select(b => new BookDto { ... })` — один SQL.
@bug 19-20 | [bug] `Find` может вернуть `null`, и нет проверки «уже выдана» | `NullReferenceException` для несуществующей книги; двое одновременно выдадут одну и ту же книгу — нужна проверка и оптимистичная конкурентность (RowVersion).
@bug 21-23 | [bug] Два `SaveChanges` вместо одного | Если второй упадёт, книга останется «выданной» без записи о выдаче. Нужен один `SaveChanges` (одна транзакция) для всех изменений.
@fixed
~~~csharp
public class BookService
{
    private readonly LibraryContext _db;
    public BookService(LibraryContext db) => _db = db;

    public Task<List<BookDto>> GetAllAsync(CancellationToken ct) =>
        _db.Books.AsNoTracking()
            .Select(b => new BookDto { Title = b.Title, Author = b.Author.Name })
            .ToListAsync(ct);

    public async Task BorrowAsync(int bookId, int userId, CancellationToken ct)
    {
        var book = await _db.Books.FindAsync(new object[] { bookId }, ct)
                   ?? throw new NotFoundException(nameof(Book), bookId);
        if (book.IsBorrowed) throw new ConflictException("Книга уже выдана");

        book.IsBorrowed = true;
        _db.Loans.Add(new Loan { BookId = bookId, UserId = userId });
        await _db.SaveChangesAsync(ct);   // одна транзакция; RowVersion ловит гонки
    }
}
~~~
:::


@@append id="p3"
## Итоговый тест фазы 3 {#lab}

:::quiz Итог фазы 3: SQL и EF Core
? Нужно вывести всех клиентов и количество их заказов (0 для клиентов без заказов). Какой запрос верный? #sql
+ `LEFT JOIN` Orders + `GROUP BY` клиента + `COUNT(o.Id)`
- `INNER JOIN` + `COUNT(*)`
- `CROSS JOIN`
- `SELECT COUNT(*) FROM Orders`
= `COUNT(*)` посчитал бы строку с NULL как 1; `COUNT(o.Id)` пропускает NULL.

? Запрос `SELECT * FROM Users WHERE Email LIKE '%@gmail.com'` не использует индекс по Email. Почему? #sql
+ Шаблон начинается с `%` — B-tree не умеет искать по суффиксу
- LIKE запрещён
- Индекс нужно перестроить
- Это ошибка планировщика
= Префиксный поиск (`'abc%'`) индекс использует; суффиксный — нет.

? Что произойдёт с кодом `foreach (var o in db.Orders.ToList()) o.Customer.Name...` при ленивой загрузке? #net
+ По запросу на каждого клиента — N+1
- Один запрос
- Ошибка компиляции
- Ничего
= Смотри SQL-лог EF Core в разработке.

? Два запроса читают баланс, каждый прибавляет 100 и пишет обратно. Итог? #sql
+ Потерянное обновление: +100 вместо +200 — нужна блокировка/версия/атомарный UPDATE
- +200
- Ошибка СУБД
- +300
= `UPDATE ... SET balance = balance + 100` атомарен.

? Что делает `SaveChanges()`? #net
+ Находит изменения в отслеживаемых сущностях и применяет их к БД в одной транзакции
- Только вставляет новые
- Закрывает соединение
- Делает коммит всех контекстов
= Не вызывай `SaveChanges` в цикле без причины.

? Почему DTO лучше, чем возврат сущностей EF из API? #net
+ Контракт API не зависит от схемы БД; не утекут лишние поля; нет циклических ссылок
- DTO быстрее
- Сущности запрещены в API
- DTO автоматически валидируются
= Сущность — деталь хранения, DTO — контракт.

? Для чего нужен `EXPLAIN ANALYZE`? #sql
+ Показать план и реальное время выполнения запроса
- Объяснить синтаксис
- Создать индекс
- Проверить права
= Без плана оптимизация — гадание.

? Почему `DbContext` нельзя делать Singleton? #net
+ Не потокобезопасен и накапливает отслеживаемые сущности
- Он слишком большой
- Singleton запрещён в ASP.NET Core
- Потому что он IDisposable
= Scoped: один контекст на запрос.
:::

:::interview N+1 в EF Core
@q Что такое проблема N+1 и как вы её находите и устраняете?
@trap Умеет ли кандидат наблюдать SQL, который генерирует ORM, а не верить в «магию».
@answer
Это ситуация, когда за списком из N элементов выполняется ещё N запросов за связанными данными. Нахожу по логу SQL (`LogTo`, Serilog, MiniProfiler), по количеству запросов на эндпоинт и по тормозам, растущим вместе с данными. Лечу: `Include`/`ThenInclude` для нужных связей; проекцию в DTO, чтобы тянуть только необходимые столбцы; `AsSplitQuery` для нескольких коллекций; в сложных случаях — явная пакетная загрузка по списку id. Стараюсь закрепить число запросов тестом.
@fail «Закэширую результат» — маскирует проблему, но не лечит.
@follow Чем опасен `Include` нескольких коллекций? (Картезианский взрыв.)
:::

:::interview Индексы
@q Как вы решаете, какие индексы создать, и что может пойти не так?
@trap Понимание цены индексов, составных индексов и умение читать планы.
@answer
Исхожу из реальных запросов: условия `WHERE`, `JOIN`, сортировки. Смотрю `EXPLAIN ANALYZE` — вижу ли Seq Scan на больших таблицах. Для составных индексов важен порядок столбцов (левый префикс). Индексы ускоряют чтение, но замедляют запись и занимают место; лишние индексы вредят. Подводные камни: функции над индексируемым столбцом, неявные приведения типов, `LIKE '%x'`, низкая селективность (индекс по булеву полю почти бесполезен).
@fail «Поставлю индекс на каждый столбец» — это замедлит запись и не поможет составным условиям.
:::

:::cards Фаза 3: минимум
Порядок выполнения SQL :: FROM → WHERE → GROUP BY → HAVING → SELECT → ORDER BY.
LEFT JOIN :: Сохраняет левые строки; условие по правой таблице — в ON.
Индекс :: Ускоряет чтение, замедляет запись; проверяй планом (EXPLAIN).
N+1 :: Запрос за списком + запрос на каждый элемент; Include/проекция/пакетная загрузка.
DbContext :: Scoped; не потокобезопасен; SaveChanges — единица работы.
:::
