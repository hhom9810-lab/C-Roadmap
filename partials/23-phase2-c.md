@@page id="p2-practice" phase="2" kind="practice" title="Практика: свой List<T>, своя хэш-таблица, 30 задач" nav="Практика: свои коллекции и задачи" est="весь период фазы"
:::why
Реализовать коллекцию самому — лучший способ перестать воспринимать её как чёрный ящик. Это не код для продакшена, а тренажёр понимания. Задачи на алгоритмы закрывают второй пункт критерия: **25–30 решённых самостоятельно**.
:::

## Задание 1. `MyList<T>` {#mylist}

- [ ] Внутри `T[] _items` и `int _count`; начальная ёмкость 0, первое расширение до 4, дальше удвоение
- [ ] `Add`, индексатор `this[int]` с проверкой границ (`ArgumentOutOfRangeException`), `Count`, `Capacity`
- [ ] `Insert(int index, T item)` и `RemoveAt(int index)` через `Array.Copy` со сдвигом
- [ ] `IndexOf`, `Contains` через `EqualityComparer<T>.Default` (без боксинга для value-типов)
- [ ] Реализует `IEnumerable<T>` через `yield return`
- [ ] Бонус: счётчик версий и `InvalidOperationException` при изменении во время `foreach`
- [ ] Проверка: те же операции на `MyList<int>` и `List<int>` дают одинаковый результат на 10 000 случайных действий

:::spoiler Каркас
~~~csharp
using System.Collections;

public sealed class MyList<T> : IEnumerable<T>
{
    private T[] _items = Array.Empty<T>();
    private int _count;
    private int _version;

    public int Count => _count;
    public int Capacity => _items.Length;

    public T this[int index]
    {
        get { CheckIndex(index); return _items[index]; }
        set { CheckIndex(index); _items[index] = value; _version++; }
    }

    public void Add(T item)
    {
        if (_count == _items.Length) Grow();
        _items[_count++] = item;
        _version++;
    }

    public void Insert(int index, T item)
    {
        if ((uint)index > (uint)_count) throw new ArgumentOutOfRangeException(nameof(index));
        if (_count == _items.Length) Grow();
        Array.Copy(_items, index, _items, index + 1, _count - index);   // сдвиг вправо
        _items[index] = item;
        _count++;
        _version++;
    }

    public void RemoveAt(int index)
    {
        CheckIndex(index);
        _count--;
        Array.Copy(_items, index + 1, _items, index, _count - index);   // сдвиг влево
        _items[_count] = default!;                                      // не держать ссылку для GC
        _version++;
    }

    public int IndexOf(T item)
    {
        var cmp = EqualityComparer<T>.Default;
        for (int i = 0; i < _count; i++)
            if (cmp.Equals(_items[i], item)) return i;
        return -1;
    }

    public IEnumerator<T> GetEnumerator()
    {
        int version = _version;
        for (int i = 0; i < _count; i++)
        {
            if (version != _version) throw new InvalidOperationException("Коллекция изменена во время перебора");
            yield return _items[i];
        }
    }

    IEnumerator IEnumerable.GetEnumerator() => GetEnumerator();

    private void Grow()
    {
        int newCapacity = _items.Length == 0 ? 4 : _items.Length * 2;
        Array.Resize(ref _items, newCapacity);
    }

    private void CheckIndex(int index)
    {
        if ((uint)index >= (uint)_count) throw new ArgumentOutOfRangeException(nameof(index));
    }
}
~~~

Приём `(uint)index >= (uint)_count` одной проверкой ловит и отрицательный индекс (он превращается в огромное беззнаковое число), и слишком большой.
:::

## Задание 2. `MyHashMap<TKey, TValue>` {#myhash}

- [ ] Массив корзин `List<(TKey Key, TValue Value)>?[]`, метод цепочек
- [ ] Номер корзины: `(comparer.GetHashCode(key) & 0x7FFFFFFF) % buckets.Length`
- [ ] `Add` (исключение на дубликат), индексатор (get бросает `KeyNotFoundException`, set — добавить или заменить), `TryGetValue`, `Remove`, `Count`
- [ ] Расширение вдвое, когда `Count > buckets.Length * 0.75`, с перераскладкой всех элементов
- [ ] Конструктор принимает `IEqualityComparer<TKey>?` (по умолчанию `EqualityComparer<TKey>.Default`)
- [ ] Эксперимент: ключ с `GetHashCode() => 1` — замерь, во сколько раз замедлился поиск, и объясни почему
- [ ] Выведи распределение длин цепочек для 10 000 строковых ключей

## Задание 3. LINQ на реальных данных

- [ ] Сгенерируй датасет на 2 000 книг и 500 читателей кодом ниже и сохрани в JSON
- [ ] 15 запросов: самые популярные жанры, авторы с наибольшим числом книг, книги без выдач, читатели с просрочками, средняя цена по жанрам, топ-5 по годам, книги по десятилетиям (`GroupBy(b => b.Year / 10 * 10)`) и т. д.
- [ ] Для каждого запроса — комментарий со сложностью

:::spoiler Генератор данных без интернета и NuGet
~~~csharp
using System.Text.Json;

var rnd = new Random(42);   // фиксированное зерно — одинаковые данные при каждом запуске
string[] authors = { "Булгаков", "Достоевский", "Толстой", "Чехов", "Гоголь", "Пушкин", "Тургенев", "Лермонтов", "Айтматов", "Набоков" };
string[] genres = { "Роман", "Повесть", "Рассказ", "Поэзия", "Драма", "Фантастика" };
string[] words = { "Тень", "Сад", "Дорога", "Город", "Ветер", "Море", "Ночь", "Дом", "Песня", "Время" };

var books = Enumerable.Range(1, 2000).Select(i => new
{
    Id = i,
    Title = $"{words[rnd.Next(words.Length)]} {words[rnd.Next(words.Length)].ToLower()} {i}",
    Author = authors[rnd.Next(authors.Length)],
    Genre = genres[rnd.Next(genres.Length)],
    Year = rnd.Next(1830, 2024),
    Copies = rnd.Next(1, 6),
}).ToList();

var options = new JsonSerializerOptions { WriteIndented = true };
File.WriteAllText("books.json", JsonSerializer.Serialize(books, options));
Console.WriteLine($"Сохранено {books.Count} книг");
~~~
:::

## Задание 4. Задачи на алгоритмы (25–30 к концу фазы) {#problems}

Решай сам. Застрял на 20 минут — посмотри подсказку (не решение). После решения — запиши сложность и посмотри 2–3 чужих решения.

**Хэш-таблицы и множества**

- [ ] Two Sum
- [ ] Contains Duplicate
- [ ] Valid Anagram
- [ ] Group Anagrams
- [ ] Top K Frequent Elements
- [ ] Ransom Note
- [ ] First Unique Character in a String
- [ ] Intersection of Two Arrays

**Массивы и два указателя**

- [ ] Best Time to Buy and Sell Stock
- [ ] Move Zeroes
- [ ] Valid Palindrome
- [ ] Squares of a Sorted Array
- [ ] Majority Element
- [ ] Missing Number
- [ ] Product of Array Except Self
- [ ] Maximum Subarray

**Стек и очередь**

- [ ] Valid Parentheses
- [ ] Min Stack
- [ ] Implement Queue using Stacks
- [ ] Baseball Game

**Бинарный поиск**

- [ ] Binary Search
- [ ] Search Insert Position
- [ ] First Bad Version
- [ ] Sqrt(x)

**Связные списки и рекурсия**

- [ ] Reverse Linked List
- [ ] Merge Two Sorted Lists
- [ ] Linked List Cycle
- [ ] Climbing Stairs
- [ ] Fibonacci Number
- [ ] Longest Substring Without Repeating Characters

:::tip Шаблон разбора каждой задачи
1. Решение в лоб и его сложность. 2. Где узкое место. 3. Какая структура данных его снимает. 4. Итоговая сложность по времени и памяти. 5. Граничные случаи: пустой вход, один элемент, дубликаты, отрицательные числа.
:::

@@page id="p2-project" phase="2" kind="project" title="Проект фазы: библиотечная система" nav="Проект: библиотека" est="3–4 недели"
:::why
Цель — свободно работать с коллекциями и LINQ на **не-игрушечных** данных. Этот же проект в Фазе 3 переедет на PostgreSQL и EF Core, поэтому сейчас важно сделать чистую модель и отделить хранение от логики.
:::

## Предметная область

- **Книга** (`Book`): Id, ISBN, название, авторы (несколько!), жанр, год, количество экземпляров.
- **Автор** (`Author`): Id, имя.
- **Читатель** (`Reader`): Id, ФИО, номер билета, тип (студент / преподаватель / внешний), дата регистрации.
- **Выдача** (`Loan`): Id, книга, читатель, дата выдачи, срок возврата, дата фактического возврата (может отсутствовать).

## Функциональные требования

- [ ] Добавление книг, авторов, читателей; уникальность ISBN и номера билета
- [ ] Выдача: нельзя выдать, если свободных экземпляров нет, у читателя больше 5 книг на руках или есть просрочка
- [ ] Возврат: фиксируется дата, считается штраф за просрочку по типу читателя (`IFineRule` из темы SOLID)
- [ ] Поиск книг: по части названия (без учёта регистра), автору, жанру, диапазону лет; комбинированные фильтры
- [ ] Сортировка и пагинация результатов (страница, размер страницы)
- [ ] Статистика через LINQ: топ-10 книг по выдачам, топ авторов, читатели-должники с суммой штрафа, загрузка по месяцам, жанры по популярности, книги, которые не выдавались ни разу
- [ ] Сохранение всего в JSON и загрузка при старте; генератор тестовых данных на 1000+ книг и 5000+ выдач

## Технические требования

- [ ] Поиск по Id и ISBN — через `Dictionary` (индексы), а не перебором списка
- [ ] Хранилище за интерфейсом (`ILibraryStore`), JSON-реализация — одна из реализаций
- [ ] Время через `IClock` — для проверки просрочек
- [ ] Своё исключение `LibraryException` и наследники для нарушений правил выдачи
- [ ] Для каждого статистического запроса — комментарий со сложностью
- [ ] Замер: время загрузки и выполнения 5 главных запросов на полном датасете — в README

## Структура

~~~text
Library/
├── Domain/        Book.cs, Author.cs, Reader.cs, Loan.cs, ReaderType.cs, LibraryException.cs
├── Rules/         IFineRule.cs, StudentFineRule.cs, ...
├── Services/      LibraryService.cs (выдача, возврат), SearchService.cs, StatsService.cs, IClock.cs
├── Storage/       ILibraryStore.cs, JsonLibraryStore.cs, DataGenerator.cs
└── Program.cs     консольное меню
~~~

## Этапы

1. [ ] Модель и генератор данных; сохранение/загрузка JSON
2. [ ] Индексы-словари и `LibraryService`: выдача и возврат со всеми правилами
3. [ ] Поиск с комбинированными фильтрами и пагинацией
4. [ ] Статистика: 6+ LINQ-запросов
5. [ ] Консольное меню, обработка ошибок
6. [ ] Замеры на полном объёме, README

## Граничные случаи

- [ ] Выдача книги с 0 свободных экземпляров → отказ
- [ ] Шестая книга читателю → отказ
- [ ] Выдача читателю с просрочкой → отказ с указанием просроченной книги
- [ ] Возврат уже возвращённой книги → отказ
- [ ] Возврат в день срока → без штрафа; на день позже → штраф за 1 день
- [ ] Дубликат ISBN, дубликат номера билета → отказ
- [ ] Поиск с пустой строкой, с пробелами, в другом регистре
- [ ] Страница за пределами результатов → пустой список, не исключение
- [ ] Повреждённый или отсутствующий JSON → понятная ошибка, старт с пустой базой только по явному решению

## Подсказки

:::spoiler Комбинированный поиск на LINQ
~~~csharp
public sealed record BookFilter(string? Text, string? Author, string? Genre, int? YearFrom, int? YearTo);

public IReadOnlyList<Book> Search(BookFilter f, int page, int pageSize)
{
    IEnumerable<Book> q = _books.Values;                       // ещё ничего не выполнено

    if (!string.IsNullOrWhiteSpace(f.Text))
        q = q.Where(b => b.Title.Contains(f.Text.Trim(), StringComparison.OrdinalIgnoreCase));
    if (!string.IsNullOrWhiteSpace(f.Author))
        q = q.Where(b => b.Authors.Any(a => a.Name.Equals(f.Author, StringComparison.OrdinalIgnoreCase)));
    if (!string.IsNullOrWhiteSpace(f.Genre))
        q = q.Where(b => b.Genre.Equals(f.Genre, StringComparison.OrdinalIgnoreCase));
    if (f.YearFrom is int from) q = q.Where(b => b.Year >= from);
    if (f.YearTo is int to) q = q.Where(b => b.Year <= to);

    return q.OrderBy(b => b.Title)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToList();                                         // выполнение — здесь
}
~~~

Запрос собирается по кусочкам, а выполняется один раз в конце. В Фазе 3 этот же код на `IQueryable` превратится в один SQL-запрос с `WHERE`, `ORDER BY`, `OFFSET` и `LIMIT`.
:::

:::spoiler Топ-10 книг по выдачам
~~~csharp
var top = _loans
    .GroupBy(l => l.BookId)                                     // O(n), хэш-таблица внутри
    .Select(g => new { BookId = g.Key, Count = g.Count() })
    .OrderByDescending(x => x.Count)                            // O(k log k), k — число разных книг
    .Take(10)
    .Select(x => new { Title = _books[x.BookId].Title, x.Count })   // индекс-словарь: O(1)
    .ToList();
~~~
:::

:::spoiler JSON: System.Text.Json
~~~csharp
using System.Text.Json;

var options = new JsonSerializerOptions { WriteIndented = true };

string json = JsonSerializer.Serialize(snapshot, options);
File.WriteAllText(path, json);

var loaded = JsonSerializer.Deserialize<LibrarySnapshot>(File.ReadAllText(path), options)
             ?? throw new LibraryException("Файл данных пуст");

public sealed record LibrarySnapshot(List<Book> Books, List<Reader> Readers, List<Loan> Loans);
~~~

Сохраняй «снимок» из простых списков, а словари-индексы строй после загрузки. Так JSON не зависит от внутренней структуры сервиса.
:::

:::key Проверка перед тем, как отметить критерий фазы
- [ ] Генератор создаёт 1000+ книг и 5000+ выдач; все функции работают на этом объёме без падений
- [ ] В README есть замеры и сложность главных запросов
- [ ] Минимум 15 осмысленных коммитов
:::

