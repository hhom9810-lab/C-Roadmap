@@page id="p2-generics" phase="2" kind="topic" title="Generics: обобщённые типы, методы и ограничения" nav="Generics" est="4–5 дней"
:::why
Все коллекции, LINQ, `Task<T>`, DI-контейнер и EF Core построены на generics. Понимать их нужно, чтобы читать сигнатуры вроде `where TEntity : class, IEntity` и писать свой переиспользуемый код без копипасты и без [боксинга](#p1-boxing).
:::

## Зачем это нужно

Открой любой серьёзный C#-проект — и ты увидишь угловые скобки на каждом шагу: `List<Book>`, `Dictionary<int, Reader>`, `Task<IActionResult>`, `ILogger<BookService>`, `DbSet<Order>`, `IRepository<T>`. Это **generics** (обобщённые типы). Без них язык был бы неудобным и небезопасным.

Что решают generics:

- **Копипаста.** Хочешь коробку для `int` — пишешь `IntBox`. Для `string` — `StringBox`. Для `Book` — `BookBox`. Generics: пишешь `Box<T>` один раз.
- **Потеря типов.** Альтернатива копипасте — хранить всё как `object`. Но тогда нужны приведения (`(int)box.Value`), ошибки типов видны только в рантайме, а значимые типы упаковываются (см. [боксинг](#p1-boxing)).
- **Выражение намерения в сигнатуре.** `IReadOnlyList<Book>` говорит больше, чем `IEnumerable`: читать можно только книги.

Без понимания generics невозможно:

- читать документацию и исходники библиотек;
- понимать ошибки компилятора вида «тип не соответствует ограничению»;
- писать свои репозитории, обёртки, результаты операций (`Result<T>`), кэши;
- отвечать на собеседовании «зачем generics и чем `List<int>` лучше `ArrayList`».

Эта тема — мост к Фазе 3 (EF Core: `DbSet<T>`) и к DI в Фазе 4.

## Интуиция и аналогия

**Форма для выпечки.** Есть форма «пирог из `T`». Она не знает, что именно внутри — яблоки, вишня или мясо. Но структура одна: корж, начинка, верх. Когда ты говоришь `Pie<Apple>`, получается конкретный пирог — и повар (компилятор) не даст положить в яблочный пирог мясо.

**Шаблон договора.** В шаблоне написано «[ИМЯ СТОРОНЫ]». Ты подставляешь имя — получается конкретный договор. Шаблон — `Box<T>`, подстановка — `Box<int>`.

А ограничение `where T : IComparable<T>` — это требование в шаблоне: «в качестве стороны допускаются только лица, имеющие паспорт». Без этого требования внутри шаблона нельзя ссылаться на паспортные данные.

## Основная теория по шагам

### Шаг 1. Зачем: типобезопасность без копипасты

~~~csharp
// Без generics пришлось бы выбирать между копипастой и object:
// class IntBox { public int Value; }  class StringBox { public string Value; }  ...
// class ObjectBox { public object Value; }   // боксинг + приведения + ошибки в рантайме

var a = new Box<int>(42);
var b = new Box<string>("книга");
int x = a.Value;                  // без приведения, без боксинга
Console.WriteLine($"{x} {b.Value}");
// int y = b.Value;               // ❌ ошибка компиляции, а не падение в рантайме

// старый подход через object:
var old = new ObjectBox("книга");
try { int bad = (int)old.Value; }            // компилируется, но падает в рантайме
catch (InvalidCastException) { Console.WriteLine("InvalidCastException в рантайме"); }

Console.WriteLine(a.GetType().Name + " / " + b.GetType().Name);
Console.WriteLine(typeof(Box<>).IsGenericTypeDefinition);
Console.WriteLine(typeof(Box<int>) == typeof(Box<int>) && typeof(Box<int>) != typeof(Box<string>));

public sealed class Box<T>
{
    public T Value { get; }
    public Box(T value) => Value = value;
}

public sealed class ObjectBox
{
    public object Value { get; }
    public ObjectBox(object value) => Value = value;
}
~~~
~~~console
42 книга
InvalidCastException в рантайме
Box`1 / Box`1
True
True
~~~

`T` — **параметр типа**. `Box<int>` и `Box<string>` — разные закрытые типы, созданные из одного определения. `Box<>` (без аргумента) — *открытое* определение. Компилятор проверяет типы на этапе сборки.

### Шаг 2. Обобщённые методы и вывод типов

~~~csharp
int[] numbers = { 5, 2, 9 };
string[] titles = { "Б", "А", "В" };

Console.WriteLine(MaxOf(numbers));     // T выведен как int
Console.WriteLine(MaxOf(titles));      // T выведен как string
Swap(ref numbers[0], ref numbers[1]);
Console.WriteLine(string.Join(",", numbers));
Console.WriteLine(MaxOf<double>(new[] { 1.5, 0.5 }));   // тип можно указать явно

static T MaxOf<T>(IEnumerable<T> items) where T : IComparable<T>
{
    using var e = items.GetEnumerator();
    if (!e.MoveNext()) throw new InvalidOperationException("Пустая последовательность");
    T max = e.Current;
    while (e.MoveNext())
        if (e.Current.CompareTo(max) > 0) max = e.Current;
    return max;
}

static void Swap<T>(ref T a, ref T b) => (a, b) = (b, a);
~~~
~~~console
9
В
2,5,9
1.5
~~~

Параметры типа бывают у классов, структур, интерфейсов, делегатов и методов. Компилятор часто **выводит** `T` сам из аргументов (как в `MaxOf(numbers)`), поэтому скобки писать не нужно. Вывод не сработает, если `T` не встречается в параметрах (например, `Create<T>()`): тогда указывай явно.

### Шаг 3. Ограничения (`where`)

Без ограничений про `T` известно только то, что это `object`. Ограничения дают право вызывать методы и сужают допустимые типы.

| Ограничение | Значит | Что даёт |
|---|---|---|
| `where T : class` | ссылочный тип | можно сравнивать с `null` как ссылку |
| `where T : struct` | значимый тип (не nullable) | `T?` — это `Nullable<T>` |
| `where T : notnull` | не допускает null | для ключей словаря |
| `where T : new()` | есть конструктор без параметров | можно писать `new T()` |
| `where T : IComparable<T>` | реализует интерфейс | можно вызвать `CompareTo` |
| `where T : BaseEntity` | наследник класса | доступ к членам базы |
| `where TKey : notnull where TValue : class` | несколько ограничений и параметров | — |

Ограничения можно комбинировать: `where T : class, IEntity, new()` (порядок: `class`/`struct` первым, `new()` последним).

~~~csharp
// Обобщённое хранилище в памяти — заготовка к Фазе 3
var books = new InMemoryRepository<Book>();
var readers = new InMemoryRepository<Reader>();
books.Add(new Book(1, "Война и мир"));
readers.Add(new Reader(1, "Анна"));
Console.WriteLine(books.Find(1)?.Title);
Console.WriteLine(books.Find(99) is null);
Console.WriteLine(readers.All().Count);

try { books.Add(new Book(1, "Дубль")); }
catch (InvalidOperationException ex) { Console.WriteLine(ex.Message); }

// var wrong = new InMemoryRepository<string>();   // ❌ string не реализует IEntity — ошибка компиляции

public interface IEntity
{
    int Id { get; }
}

public sealed class InMemoryRepository<TEntity> where TEntity : class, IEntity
{
    private readonly Dictionary<int, TEntity> _items = new();

    public void Add(TEntity entity)
    {
        if (!_items.TryAdd(entity.Id, entity))
            throw new InvalidOperationException($"{typeof(TEntity).Name} с Id={entity.Id} уже есть");
    }

    public TEntity? Find(int id) => _items.GetValueOrDefault(id);
    public IReadOnlyCollection<TEntity> All() => _items.Values;
}

public sealed record Book(int Id, string Title) : IEntity;
public sealed record Reader(int Id, string Name) : IEntity;
~~~
~~~console
Война и мир
True
1
Book с Id=1 уже есть
~~~

Один и тот же код хранилища работает для книг и читателей, а `string` компилятор отвергнет заранее. Это ровно тот шаблон, по которому устроены `IRepository<T>` и `DbSet<T>`.

### Шаг 4. `default(T)`, `new T()` и сравнение значений

Внутри generic-метода ты не знаешь, значимый `T` или ссылочный. Поэтому нужны специальные приёмы:

~~~csharp
static T? FirstOrDefaultValue<T>(IReadOnlyList<T> list) => list.Count > 0 ? list[0] : default;

Console.WriteLine(FirstOrDefaultValue(new List<int>()));        // 0
Console.WriteLine(FirstOrDefaultValue(new List<string>()) is null);   // true
Console.WriteLine(FirstOrDefaultValue(new List<bool>()));       // False

static T Create<T>() where T : new() => new T();
Console.WriteLine(Create<List<int>>().Count);

// сравнение с равенством: == для неограниченного T недоступен
static bool AreSame<T>(T x, T y) => EqualityComparer<T>.Default.Equals(x, y);
Console.WriteLine(AreSame(3, 3));
Console.WriteLine(AreSame("a", "b"));
Console.WriteLine(AreSame<string?>(null, null));
~~~
~~~console
0
True
False
0
True
False
True
~~~

- `default` даёт «нулевое» значение: `0` для чисел, `false`, `null` для ссылочных типов.
- Оператор `==` для неограниченного `T` недоступен (компилятор не знает, есть ли он у типа); используй `EqualityComparer<T>.Default.Equals(x, y)` — он корректно работает и для структур (без боксинга), и для ссылок, и для `null`.
- `new T()` требует ограничения `new()`.

### Шаг 5. Generic-классы: статические поля и вложенные типы

Каждый **закрытый** generic-тип — самостоятельный тип с собственными статическими данными:

~~~csharp
Counter<int>.Hits++;
Counter<int>.Hits++;
Counter<string>.Hits++;
Console.WriteLine($"int: {Counter<int>.Hits}, string: {Counter<string>.Hits}, double: {Counter<double>.Hits}");

static class Counter<T>
{
    public static int Hits;       // отдельная копия для КАЖДОГО T
}
~~~
~~~console
int: 2, string: 1, double: 0
~~~

Следствие: статический кэш в generic-классе разделён по типам — полезно для кэширования по типу, но неожиданно, если ждёшь «один счётчик на всех».

### Шаг 6. Вариантность — только чтобы понимать сигнатуры

~~~csharp
IEnumerable<string> strings = new List<string> { "a" };
IEnumerable<object> objects = strings;      // ✅ IEnumerable<out T> ковариантен: можно только читать
Console.WriteLine(objects.First());

List<string> list = new() { "a" };
// List<object> objs = list;                // ❌ List<T> инвариантен: иначе можно было бы добавить туда int

// контравариантность: Action<in T> — «принимает» T
Action<object> printAny = o => Console.WriteLine($"получил: {o}");
Action<string> printString = printAny;      // ✅ тот, кто умеет принимать object, примет и string
printString("привет");

Func<string> makeString = () => "текст";
Func<object> makeObject = makeString;       // ✅ Func<out TResult> ковариантен
Console.WriteLine(makeObject());
~~~
~~~console
a
получил: привет
текст
~~~

`out T` в объявлении `IEnumerable<out T>` означает: `T` только «выходит» наружу, поэтому безопасно смотреть на последовательность строк как на последовательность объектов. `in T` (как в `Action<in T>`, `IComparer<in T>`) — наоборот, `T` только «входит», и обработчик общего типа годится для частного. Запомни идею, писать свои вариантные интерфейсы в этой фазе не нужно.

Работает вариантность **только для ссылочных типов** и только на интерфейсах и делегатах (не на классах): `IEnumerable<int>` в `IEnumerable<object>` не присвоить.

### Шаг 7. Практика: свой `Result<T>` и generic-расширение

Два шаблона, которые ты увидишь в реальных проектах. Первый — объект результата операции, чтобы не бросать исключение на ожидаемую ошибку:

~~~csharp
var ok = Result<int>.Success(42);
var fail = Result<int>.Failure("Книга не найдена");

Console.WriteLine(Describe(ok));
Console.WriteLine(Describe(fail));
Console.WriteLine(ok.Map(x => x * 2).Value);
Console.WriteLine(fail.Map(x => x * 2).IsSuccess);        // ошибка «протекает» дальше без вызова лямбды

static string Describe<T>(Result<T> r) => r.IsSuccess ? $"OK: {r.Value}" : $"Ошибка: {r.Error}";

public readonly record struct Result<T>(bool IsSuccess, T? Value, string? Error)
{
    public static Result<T> Success(T value) => new(true, value, null);
    public static Result<T> Failure(string error) => new(false, default, error);

    // преобразование внутреннего значения, если оно есть
    public Result<TOut> Map<TOut>(Func<T, TOut> f) =>
        IsSuccess ? Result<TOut>.Success(f(Value!)) : Result<TOut>.Failure(Error!);
}
~~~
~~~console
OK: 42
Ошибка: Книга не найдена
84
False
~~~

Второй — generic-метод расширения, аналог `Chunk` из практики:

~~~csharp
foreach (var part in new[] { 1, 2, 3, 4, 5 }.Batch(2))
    Console.WriteLine(string.Join(",", part));

static class Ext
{
    public static IEnumerable<List<T>> Batch<T>(this IEnumerable<T> source, int size)
    {
        ArgumentOutOfRangeException.ThrowIfLessThan(size, 1);
        var bucket = new List<T>(size);
        foreach (var item in source)
        {
            bucket.Add(item);
            if (bucket.Count == size) { yield return bucket; bucket = new List<T>(size); }
        }
        if (bucket.Count > 0) yield return bucket;
    }
}
~~~
~~~console
1,2
3,4
5
~~~

Обрати внимание: один и тот же `Batch<T>` режет и числа, и строки, и книги, не зная, что внутри. Это и есть «алгоритм одинаков для всех `T`». Конструкция `yield return` — тема следующей страницы про [итераторы](#p2-iterators).

### Шаг 8. Нужны ли generics: простой критерий

Прежде чем писать `Method<T>`, ответь:

- Алгоритм *одинаков* для всех допустимых `T`? → generic.
- Внутри придётся делать `if (item is Book) … else if (item is Reader) …`? → нет, перегрузки или полиморфизм.
- Нужен доступ к членам `T`? → добавь ограничение (интерфейс или базовый класс).
- Нужна арифметика? → в современном .NET есть generic math (`INumber<T>`), но это тема на потом.

:::deep Граница
Как JIT генерирует код для generic-типов (отдельный машинный код для каждого value-типа, общий — для ссылочных), статические поля в generic-классах, `static abstract` члены интерфейсов и generic math — rabbit hole. Запиши, если интересно.
:::

### Шаг 9. Учимся читать чужие сигнатуры

Умение разбирать generic-сигнатуры — практический навык: документация и подсказки IDE пестрят ими. Пошагово разберём несколько реальных.

- `IEnumerable<TResult> Select<TSource, TResult>(this IEnumerable<TSource> source, Func<TSource, TResult> selector)` — это LINQ-метод. Читаем: «расширение для последовательности из `TSource`; принимает функцию, превращающую `TSource` в `TResult`; возвращает последовательность `TResult`». Оба типа выводятся из лямбды: `books.Select(b => b.Title)` даёт `IEnumerable<string>`, потому что лямбда возвращает строку.
- `Task<T> GetAsync<T>(string url)` — асинхронная операция, результат которой будет типа `T`. Ты сам выбираешь `T`, и именно им метод десериализует ответ.
- `void Register<TService, TImpl>() where TImpl : class, TService` — типичная регистрация в DI-контейнере: «реализация `TImpl` должна быть классом и подходить под интерфейс `TService`». Ограничение ссылается на другой параметр типа — это допустимо.
- `Dictionary<TKey, TValue> where TKey : notnull` — ключ не может быть `null`, и компилятор предупредит, если попытаться использовать nullable-тип в качестве ключа.
- `Func<in T, out TResult>` — делегат с вариантностью: аргумент контравариантен, результат ковариантен. Именно поэтому `Func<object, string>` можно использовать там, где ждут `Func<string, object>`.

Правило чтения: сначала найди параметры типа в угловых скобках после имени, затем `where` в конце, затем посмотри, где параметры используются в сигнатуре (аргументы и результат). Обычно этого достаточно, чтобы понять контракт метода без чтения документации. Если сигнатура выглядит пугающе, подставь в голове конкретные типы (`TSource = Book`, `TResult = string`) — абстракция сразу превращается в обычный метод. Этот приём работает и при чтении сообщений компилятора: ошибка «тип `string` не может использоваться как параметр типа `T`, потому что не удовлетворяет ограничению» всегда означает, что ты подставил тип, у которого нет нужного интерфейса, конструктора или базового класса.

## Как это работает под капотом

- **Generics — не шаблоны C++ и не стирание типов Java.** В IL хранится одно определение с параметрами типа; конкретные типы подставляются **во время выполнения** (CLR знает, что такое `List<int>`, и даже `typeof(List<int>)` работает). В Java `List<Integer>` после компиляции становится `List` — информация стирается.
- **Для значимых типов JIT создаёт отдельный машинный код** на каждое закрытие: `List<int>` и `List<double>` компилируются раздельно и работают на «голых» значениях без боксинга. Это даёт скорость.
- **Для ссылочных типов код общий:** `List<string>` и `List<Book>` разделяют один скомпилированный вариант (все ссылки одного размера), поэтому раздувания кода нет.
- **Закрытые типы — отдельные объекты `Type`** со своими статическими полями и метаданными; открытое определение `List<>` живёт в метаданных сборки.
- **Ограничения проверяются компилятором.** В IL они записываются как метаданные, а ещё проверяются рантаймом при создании типа через рефлексию (`MakeGenericType`).
- **`EqualityComparer<T>.Default`** создаётся один раз на тип и для структур с `IEquatable<T>` вызывает типизированный `Equals` без боксинга — именно им пользуются `Dictionary` и `HashSet`.
- **Вариантность** — свойство *интерфейсов и делегатов* на уровне CLR; массивы ковариантны исторически и небезопасно (см. [массивы](#p2-list)).
- **Почему `List<int>` быстрее `ArrayList`.** Внутри `List<int>` — настоящий `int[]`; `ArrayList` хранит `object[]`, значит каждое число упаковывается в объект в куче, что давит на сборщик мусора.

Справочник: [Generics](#/ref/b/ty-generics), [вариантность](#/ref/b/ty-variance), [generics в рантайме](#/ref/g/rt-generics-runtime), [боксинг](#/ref/b/ty-boxing), [стек и куча](#/ref/g/rt-stack-heap).

## Типичные ошибки и ловушки

:::danger Generic «на всякий случай»
`Process<T>(T item)`, который внутри делает `if (item is Book) ... else if (item is Reader) ...`, — это не обобщённый код, а замаскированный `object`. Generic уместен, когда алгоритм **одинаков** для всех `T`.
:::

- **Попытка вызвать член без ограничения.** `item.Id` внутри `Method<T>(T item)` не скомпилируется — нужно `where T : IEntity`.
- **`T x = null` без `class`.** Для структур `null` недопустим; используй `default` или ограничение `class`.
- **`==` на неограниченном `T`.** Ошибка компиляции; используй `EqualityComparer<T>.Default` или `Equals`.
- **Лишние ограничения.** Требовать `class, new(), IEntity, IDisposable` там, где нужен лишь `IEntity`, — значит сужать повторное использование.
- **Путать `T?` для структур и ссылок.** Для `where T : struct` `T?` — это `Nullable<T>`; для `where T : class` — просто аннотация nullable-ссылки. Без ограничений `T?` означает «`default` допустим».
- **Ожидание общего статического поля.** У `Counter<int>` и `Counter<string>` разные статики.
- **Попытка приравнять `List<Dog>` и `List<Animal>`.** Инвариантность защищает от записи неподходящего элемента; нужен `IEnumerable<Animal>` или `IReadOnlyList<Animal>`.
- **Рефлексия вместо generics.** `Activator.CreateInstance(type)` там, где можно `new T()`, — потеря скорости и безопасности.
- **Слишком много параметров типа.** `Handler<TRequest, TResponse, TContext, TLogger, TOptions>` читать невозможно; часто это знак неудачного дизайна.
- **Забыть, что generic-метод не подходит для разных «форм».** Если для `int` и `string` нужна разная логика — это два метода, а не один `T`.

## Вопросы с собеседований

:::spoiler Почему `List<int>` не боксит, а `ArrayList` боксит?
`List<int>` — закрытый тип с внутренним массивом `int[]`: значения хранятся напрямую. `ArrayList` хранит `object[]`, поэтому каждый `int` упаковывается.
:::

:::spoiler Зачем `where T : IComparable<T>` в `MaxOf`?
Без ограничения компилятор знает о `T` только то, что это `object`, и не даст вызвать `CompareTo`. Ограничение гарантирует, что метод есть у любого допустимого `T`.
:::

:::spoiler Почему `List<string>` нельзя присвоить `List<object>`, а `IEnumerable<string>` в `IEnumerable<object>` — можно?
`List<T>` позволяет добавлять элементы: через `List<object>` можно было бы положить `int` в список строк. `IEnumerable<out T>` только отдаёт элементы, поэтому подстановка безопасна (ковариантность).
:::

:::spoiler Чем generics в C# отличаются от generics в Java? (ловушка: «просто синтаксис»)
В Java тип-параметры стираются при компиляции (type erasure), в runtime остаётся сырой `List`; значимые типы в generics нельзя (`List<int>` невозможно). В C# CLR знает конкретные типы во время выполнения, `typeof(List<int>)` работает, значимые типы не боксятся, а для них JIT генерирует отдельный код.
:::

:::spoiler Как создать экземпляр `T` внутри generic-метода?
С ограничением `where T : new()` — `new T()`. Для конструкторов с параметрами — передавать фабрику `Func<T>` или использовать рефлексию (хуже).
:::

:::spoiler Зачем `EqualityComparer<T>.Default`, если есть `Equals`?
`x.Equals(y)` упадёт на `null` и для структур может вызвать боксинг. `EqualityComparer<T>.Default` корректно обрабатывает `null`, использует `IEquatable<T>`, не боксит структуры.
:::

:::spoiler Что такое ковариантность и контравариантность? Приведи примеры.
Ковариантность (`out`): `IEnumerable<string>` → `IEnumerable<object>`; `Func<string>` → `Func<object>`. Контравариантность (`in`): `Action<object>` → `Action<string>`; `IComparer<object>` → `IComparer<string>`. Работает на интерфейсах/делегатах и только для ссылочных типов.
:::

:::spoiler Есть ли общие статические поля у `Counter<int>` и `Counter<string>`?
Нет. Каждый закрытый generic-тип — отдельный тип со своими статическими полями.
:::

## Что запомнить

- Generics — типобезопасность без копипасты и без боксинга: `Box<T>`, `List<T>`, `Task<T>`.
- Тип выводится из аргументов; явно указываем, когда `T` нет в параметрах.
- `where` даёт право использовать членов `T`: `class`, `struct`, `notnull`, `new()`, интерфейсы, базовые классы.
- `default(T)` — «ноль»; сравнение — через `EqualityComparer<T>.Default`; `new T()` требует `new()`.
- У каждого закрытого типа своя статика; для значимых типов JIT делает отдельный код, для ссылочных — общий.
- `out T` — ковариантность (только отдаём), `in T` — контравариантность (только принимаем); `List<T>` инвариантен.
- Generic уместен, когда алгоритм одинаков для всех `T`.

## Практика

- [ ] Написал `Pair<TFirst, TSecond>` и метод `Swap()`, возвращающий `Pair<TSecond, TFirst>`
- [ ] Написал `MinMax<T>(IEnumerable<T>) where T : IComparable<T>` с кортежем на выходе
- [ ] Сделал `InMemoryRepository<TEntity>` и использовал его для книг и читателей
- [ ] Написал generic-метод `Chunk<T>(IReadOnlyList<T> items, int size)`, который режет список на части

@@page id="p2-iterators" phase="2" kind="topic" title="IEnumerable, yield и отложенное выполнение" nav="IEnumerable и yield" est="~1 неделя"
:::why
Без этой темы LINQ — магия. С ней понятно, почему `.Where().Select()` не создаёт промежуточных списков, почему запрос «видит» изменения данных и почему перебор одного запроса дважды может дважды сходить в базу. Это прямая подготовка к третьему пункту критерия.
:::

## Зачем это нужно

Самая частая «необъяснимая» ошибка в работе с данными в .NET выглядит так: разработчик пишет запрос, видит в отладчике правильный результат, а потом код ведёт себя странно — запрос выполняется дважды, ошибка вылетает не там, где строился запрос, данные «обновились сами». За этим стоит одно и то же: **отложенное выполнение** и `IEnumerable<T>`.

Что даёт понимание итераторов:

- **LINQ перестаёт быть магией.** Каждый оператор — обычный итератор; цепочка — это матрёшка из них.
- **Память.** Можно обрабатывать файл на гигабайты или бесконечный поток событий, не загружая всё в память.
- **Корректность.** Ты знаешь, когда запрос реально исполняется (и когда в EF Core будет отправлен SQL), и не делаешь двойную работу.
- **Свои методы-генераторы.** `yield return` позволяет написать последовательность одним естественным циклом, без ручного класса-перечислителя.
- **Собеседования.** «Что выведет этот код?» про `yield` и отложенный запрос — один из самых частых вопросов по C#.

Эта тема напрямую подготавливает следующую — [LINQ](#p2-linq): там отложенное выполнение разбирается на цепочках операторов.

## Интуиция и аналогия

**Книга и закладка.** `IEnumerable<T>` — это *книга* («её можно читать»), а `IEnumerator<T>` — *закладка с чтением*: она помнит, где ты остановился, и умеет «перевернуть страницу» (`MoveNext`). Одну книгу могут читать несколько человек одновременно — у каждого своя закладка. Книга не обязана быть напечатанной заранее: она может **сочиняться на ходу**, по странице за раз.

**Рецепт против готового блюда.** `List<T>` — готовое блюдо на столе: можно съесть сколько угодно раз, оно не меняется. `IEnumerable<T>` из запроса — рецепт. Пока никто не готовит, ничего не происходит. Каждый раз, когда ты «исполняешь рецепт» (перебираешь), блюдо готовится заново — с теми продуктами, что лежат в холодильнике сейчас.

**Конвейер.** Цепочка `Where → Select → Take` — конвейер: деталь едет по ленте через все станки по одной. Склада между станками нет (нет промежуточных списков). Если заказчик взял 2 детали и ушёл (`Take(2)`), станки останавливаются.

## Основная теория по шагам

### Шаг 1. Что такое `IEnumerable<T>`

Это контракт «меня можно перебрать». Он отдаёт **перечислитель** — объект с курсором:

~~~csharp
public interface IEnumerable<out T>
{
    IEnumerator<T> GetEnumerator();
}

public interface IEnumerator<out T> : IDisposable
{
    T Current { get; }   // текущий элемент
    bool MoveNext();     // сдвинуться к следующему; false — элементов больше нет
    // (плюс Reset, унаследованный от необобщённого IEnumerator, — на практике не используется)
}
~~~

Курсор стоит **перед** первым элементом. Первый `MoveNext()` ставит его на первый элемент (или возвращает `false` для пустой последовательности). `Current` до первого `MoveNext()` и после `false` использовать нельзя.

Интерфейсов целая иерархия: `IEnumerable<T>` (только перебор) → `ICollection<T>` (плюс `Count`, `Add`, `Remove`) → `IList<T>` (плюс индексатор). Принимай в параметрах **самый узкий** тип, который тебе нужен: если достаточно перебрать — `IEnumerable<T>`; нужен `Count` и индекс — `IReadOnlyList<T>`.

### Шаг 2. Во что разворачивается `foreach`

~~~csharp
var titles = new List<string> { "Мастер и Маргарита", "Обломов" };

foreach (var t in titles) Console.WriteLine(t);

Console.WriteLine("— вручную —");
// Компилятор превращает foreach примерно в:
using (var e = titles.GetEnumerator())
{
    while (e.MoveNext())
    {
        var t = e.Current;
        Console.WriteLine(t);
    }
}
~~~
~~~console
Мастер и Маргарита
Обломов
— вручную —
Мастер и Маргарита
Обломов
~~~

Важно: `IEnumerable<T>` не обязан хранить данные. Он может **вычислять** их по одному на каждый `MoveNext()`. Для `foreach` достаточно, чтобы у типа был метод `GetEnumerator()` с подходящей формой — даже без реализации `IEnumerable` (так называемая «утиная типизация», благодаря ей `List<T>` и `Span<T>` перебираются без аллокаций).

Реализуем перечислитель вручную — один раз, чтобы увидеть, как это устроено:

~~~csharp
foreach (int n in new Range1(3, 6)) Console.Write(n + " ");
Console.WriteLine();

sealed class Range1 : IEnumerable<int>
{
    private readonly int _from, _to;
    public Range1(int from, int to) { _from = from; _to = to; }

    public IEnumerator<int> GetEnumerator() => new Cursor(_from, _to);
    System.Collections.IEnumerator System.Collections.IEnumerable.GetEnumerator() => GetEnumerator();

    private sealed class Cursor : IEnumerator<int>
    {
        private readonly int _to;
        private int _current;
        public Cursor(int from, int to) { _current = from - 1; _to = to; }   // ВСТАЛИ ПЕРЕД первым
        public int Current => _current;
        object System.Collections.IEnumerator.Current => Current;
        public bool MoveNext() => ++_current <= _to;
        public void Reset() => throw new NotSupportedException();
        public void Dispose() { }
    }
}
~~~
~~~console
3 4 5 6
~~~

Много кода ради простого диапазона. Именно эту рутину берёт на себя `yield`.

### Шаг 3. `yield return`: перечислитель пишет компилятор

~~~csharp
foreach (int n in CountTo(3))
    Console.WriteLine($"получил {n}");

static IEnumerable<int> CountTo(int max)
{
    Console.WriteLine("старт");
    for (int i = 1; i <= max; i++)
    {
        Console.WriteLine($"  отдаю {i}");
        yield return i;                       // пауза: отдать значение и «заморозить» метод
    }
    Console.WriteLine("конец");
}
~~~
~~~console
старт
  отдаю 1
получил 1
  отдаю 2
получил 2
  отдаю 3
получил 3
конец
~~~

Метод с `yield return` компилятор превращает в класс-**машину состояний**: локальные переменные становятся полями, а каждый `MoveNext()` продолжает выполнение с места последнего `yield`. Вывод чередуется: элементы производятся **по одному, по требованию**.

Ключевые слова: `yield return x` — «отдай `x` и приостановись»; `yield break` — «закончить последовательность досрочно». Метод-итератор нельзя сочетать с `return значение`, `ref`/`out` параметрами и `unsafe`-кодом, а `yield return` нельзя использовать внутри `try` с `catch` (внутри `try`/`finally` — можно).

### Шаг 4. Отложенное выполнение

~~~csharp
var seq = CountTo(3);                // ничего не напечатается! Метод даже не начал выполняться
Console.WriteLine("последовательность создана");
var first = seq.First();             // теперь: «старт», «отдаю 1» — и остановка
Console.WriteLine(first);

static IEnumerable<int> CountTo(int max)
{
    Console.WriteLine("старт");
    for (int i = 1; i <= max; i++)
    {
        Console.WriteLine($"  отдаю {i}");
        yield return i;
    }
}
~~~
~~~console
последовательность создана
старт
  отдаю 1
1
~~~

Вызов итератора лишь **создаёт объект**. Код выполняется, когда кто-то начинает перебор, и ровно настолько, насколько далеко перебор зашёл.

Из этого следует важная вещь про **проверку аргументов**. Исключение в итераторе «взрывается» не при вызове, а при первом `MoveNext()`:

~~~csharp
var bad = Take3(null!);                 // ничего не произошло
Console.WriteLine("метод вызван");
try { bad.ToList(); }
catch (ArgumentNullException) { Console.WriteLine("исключение — только при переборе"); }

try { Take3Checked(null!); }            // проверка в обёртке срабатывает сразу
catch (ArgumentNullException) { Console.WriteLine("исключение — сразу при вызове"); }

static IEnumerable<int> Take3(int[] source)
{
    ArgumentNullException.ThrowIfNull(source);          // выполнится ЛЕНИВО
    for (int i = 0; i < 3; i++) yield return source[i];
}

// принято: проверять аргументы в обычном методе, а ленивую часть вынести в локальную функцию
static IEnumerable<int> Take3Checked(int[] source)
{
    ArgumentNullException.ThrowIfNull(source);          // выполняется сразу
    return Impl();

    IEnumerable<int> Impl()
    {
        for (int i = 0; i < 3; i++) yield return source[i];
    }
}
~~~
~~~console
метод вызван
исключение — только при переборе
исключение — сразу при вызове
~~~

Правильный шаблон: внешний метод проверяет аргументы немедленно и возвращает внутренний итератор — так ошибки видны там, где вызван метод.

### Шаг 5. Бесконечные и ленивые последовательности

~~~csharp
foreach (var id in GenerateIds().Take(3))
    Console.WriteLine(id);           // бесконечный генератор не зависнет: Take остановит перебор

Console.WriteLine(string.Join(",", Fibonacci().Take(10)));
Console.WriteLine(Fibonacci().First(x => x > 1000));

static IEnumerable<string> GenerateIds()
{
    for (int i = 1; ; i++) yield return $"R-{i:D4}";
}

static IEnumerable<long> Fibonacci()
{
    long a = 0, b = 1;
    while (true) { yield return a; (a, b) = (b, a + b); }
}
~~~
~~~console
R-0001
R-0002
R-0003
0,1,1,2,3,5,8,13,21,34
1597
~~~

Бесконечные последовательности опасны только в одном случае: если вызвать `ToList()`, `Count()`, `OrderBy` (без `Take`) — перебор не закончится, память кончится. Всегда ограничивай их `Take`, `First`, `TakeWhile`.

### Шаг 6. Свой `MyWhere`: ленивость руками

~~~csharp
var data = new[] { 1, 2, 3, 4, 5, 6 };
var q = data.MyWhere(x => { Console.WriteLine($"  проверяю {x}"); return x % 2 == 0; });
Console.WriteLine("запрос создан, проверок нет");

foreach (var x in q.Take(2)) Console.WriteLine($"→ {x}");

static class MyLinq
{
    public static IEnumerable<T> MyWhere<T>(this IEnumerable<T> source, Func<T, bool> predicate)
    {
        foreach (var item in source)
            if (predicate(item)) yield return item;
    }
}
~~~
~~~console
запрос создан, проверок нет
  проверяю 1
  проверяю 2
→ 2
  проверяю 3
  проверяю 4
→ 4
~~~

Это ровно то, как устроен настоящий `Where` (с оптимизациями для массивов и списков). Весь LINQ — набор таких итераторов, вложенных друг в друга.

### Шаг 7. Ловушка: многократный перебор

~~~csharp
IEnumerable<int> expensive = Compute();

Console.WriteLine(expensive.Count());   // перебор №1: вычисления выполняются
Console.WriteLine(expensive.Sum());     // перебор №2: ВСЁ вычисляется заново

var cached = expensive.ToList();        // материализовали один раз
Console.WriteLine(cached.Count);        // дальше — без повторных вычислений
Console.WriteLine(cached.Sum());

static IEnumerable<int> Compute()
{
    for (int i = 0; i < 3; i++)
    {
        Console.WriteLine($"  тяжёлое вычисление {i}");
        yield return i * i;
    }
}
~~~
~~~console
  тяжёлое вычисление 0
  тяжёлое вычисление 1
  тяжёлое вычисление 2
3
  тяжёлое вычисление 0
  тяжёлое вычисление 1
  тяжёлое вычисление 2
5
  тяжёлое вычисление 0
  тяжёлое вычисление 1
  тяжёлое вычисление 2
3
5
~~~

В Фазе 3 «тяжёлое вычисление» — это запрос к базе данных. Дважды перебрал — дважды сходил в базу. IDE (и анализаторы) подсвечивают это как «possible multiple enumeration».

:::key Правило
`IEnumerable<T>` — **рецепт**, а не данные. Если нужно перебрать результат несколько раз или нужен `Count`/индекс — материализуй через `ToList()`/`ToArray()`.
:::

Обратная сторона отложенности — запрос видит **актуальные данные на момент перебора**:

~~~csharp
var source = new List<int> { 1, 2, 3 };
var doubled = source.Select(x => x * 2);       // ленивый запрос
var snapshot = source.Select(x => x * 2).ToList();   // снимок прямо сейчас

source.Add(4);
Console.WriteLine(string.Join(",", doubled));    // запрос выполняется сейчас → видит 4
Console.WriteLine(string.Join(",", snapshot));   // снимок не видит
~~~
~~~console
2,4,6,8
2,4,6
~~~

### Шаг 8. Освобождение ресурсов: `finally` и `Dispose`

`foreach` оборачивает перебор в `using`, поэтому при досрочном выходе вызывается `Dispose` перечислителя, а в нём — блоки `finally` итератора. Это гарантирует закрытие файла:

~~~csharp
foreach (var line in ReadLinesWithLog())
{
    Console.WriteLine($"получил {line}");
    break;                                         // выходим досрочно
}

static IEnumerable<string> ReadLinesWithLog()
{
    Console.WriteLine("открываю ресурс");
    try
    {
        yield return "строка 1";
        yield return "строка 2";
    }
    finally
    {
        Console.WriteLine("ресурс закрыт");        // сработает и при break
    }
}
~~~
~~~console
открываю ресурс
получил строка 1
ресурс закрыт
~~~

Поэтому `File.ReadLines` можно спокойно прерывать — файл закроется.

### Шаг 9. Чтение большого файла построчно

~~~csharp
// File.ReadLines ленивый: файл в 2 ГБ не загружается в память целиком
// var bigLoans = File.ReadLines("loans.csv").Skip(1).Where(l => l.Contains(";overdue"));
// File.ReadAllLines, наоборот, сразу читает всё в string[]
~~~

Правило: если тебе нужно *пройти один раз* — лениво (`ReadLines`, `yield`); если *вернуться* к данным — материализуй.

### Шаг 10. Что возвращать из метода: `IEnumerable<T>` или список

Выбор типа результата — это обещание вызывающему коду. Несколько практических правил:

- **Метод возвращает «живой» запрос или генератор** — тип `IEnumerable<T>`. Вызывающий должен понимать, что перебор может быть дорогим и что результат нельзя считать снимком.
- **Метод уже собрал данные в память** — честнее вернуть `IReadOnlyList<T>`: вызывающий видит, что есть `Count` и индекс, и не боится повторного перебора.
- **Нужен снимок на момент вызова** — материализуй внутри метода (`ToList()`) и возвращай как `IReadOnlyList<T>`. Особенно если внутри был ресурс (контекст базы, файл), который закроется на выходе из метода.
- **Параметры** принимай как самый узкий тип: `IEnumerable<T>`, если нужен один проход; `IReadOnlyCollection<T>`, если нужен `Count`; `IReadOnlyList<T>`, если нужен индекс.
- Никогда не возвращай `null` вместо пустой последовательности: используй `Enumerable.Empty<T>()` или пустой массив — вызывающему не придётся писать проверку перед каждым `foreach`.

Простой тест: если твой метод вызывают дважды подряд с перебором результата, будет ли работа выполнена дважды? Если да, и это неочевидно из сигнатуры — скорее всего, нужно вернуть материализованный результат.

## Как это работает под капотом

- **Класс-машина состояний.** Для метода с `yield` компилятор генерирует вложенный класс с полями: состояние (`<>1__state`), текущее значение (`<>2__current`), параметры и все локальные переменные. `MoveNext()` — большой `switch` по состоянию: каждый `yield return` — отдельная ветка с сохранением позиции.
- **Один объект — и `IEnumerable`, и `IEnumerator`.** Сгенерированный класс реализует оба интерфейса; для первого перебора в том же потоке экземпляр используется повторно как перечислитель (экономия аллокации), а для повторного создаётся копия.
- **Версия коллекции.** Перечислитель `List<T>` запоминает `_version` и при каждом `MoveNext()` проверяет, не изменилась ли коллекция; поэтому `foreach` не даёт менять список (`InvalidOperationException`).
- **Структурные перечислители.** `List<T>.Enumerator` — `struct`, поэтому `foreach` по `List<T>` не создаёт мусор; через интерфейс `IEnumerable<T>` он упаковывается (боксинг). Это одна из причин, почему принимать `List<T>` бывает быстрее, чем `IEnumerable<T>`.
- **Оптимизации LINQ.** `Where`, `Select`, `ToList` проверяют, не массив ли или `List<T>` на входе, и берут быстрый путь; `Count()` у `ICollection<T>` читает свойство вместо перебора. Но полагаться на это не стоит.
- **`yield` и `async`.** Для асинхронных потоков есть `IAsyncEnumerable<T>` и `await foreach` — та же идея с `await`; встретишь в Фазе 5.
- **Состояние итератора нельзя «перемотать».** Одноразовые источники (поток из сети, `DataReader`) можно перебрать только один раз: второй `foreach` не вернётся в начало.

Справочник: [итераторы и yield](#/ref/d/fl-iterators), [отложенное выполнение](#/ref/e/co-linq-deferred), [производительность LINQ](#/ref/e/co-linq-perf).

## Типичные ошибки и ловушки

- **Многократный перебор запроса.** Каждый перебор — повторное выполнение (в EF Core — повторный запрос в БД). Материализуй `ToList()`.
- **Считать, что `var q = ...Where(...)` уже выполнен.** Ничего не произошло, пока не начался перебор; исключения и побочные эффекты проявятся позже.
- **Побочные эффекты в лямбдах и итераторах.** Они срабатывают столько раз, сколько перебирают, и в «неожиданный» момент.
- **Захват изменяемой переменной.** Лямбда запоминает *переменную*, а не её значение; запрос увидит изменения (см. [LINQ](#p2-linq)).
- **Освобождение источника до перебора.** `using var ctx = ...; return ctx.Books.Where(...)` — контекст закрыт, а перебор ещё впереди → ошибка. Материализуй до выхода из `using`.
- **Бесконечная последовательность без `Take`.** Зависание и `OutOfMemoryException`.
- **Проверка аргументов внутри итератора.** Исключение вылетит только при первом `MoveNext()`; выноси проверку в обёртку.
- **Изменение коллекции во время перебора.** `InvalidOperationException`; перебирай копию (`ToList()`) или собирай изменения отдельно.
- **`yield return` внутри `try-catch`.** Не компилируется; выноси обработку исключений в вызывающий код или оборачивай отдельные операции.
- **`Count()` и `Any()` на «дорогих» последовательностях.** Каждый вызов — отдельный перебор.
- **Возврат `IEnumerable<T>`, когда данные уже в списке.** Скрывает тип, провоцирует повторные вычисления, если внутри не список; продумай, что обещает метод.

## Вопросы с собеседований

:::spoiler Что напечатает `var s = CountTo(3);` без перебора?
Ничего. Вызов итератора создаёт объект-машину состояний; тело метода начнёт выполняться только при первом `MoveNext()`.
:::

:::spoiler Во что компилятор превращает метод с `yield return`?
В класс, реализующий `IEnumerable<T>` и `IEnumerator<T>`: локальные переменные становятся полями, а `MoveNext()` — `switch` по номеру состояния, продолжающий выполнение после последнего `yield return`.
:::

:::spoiler Почему `File.ReadLines` лучше `File.ReadAllLines` для огромного файла?
`ReadLines` — ленивая последовательность: читает строку за строкой по мере перебора, память O(1) по количеству строк. `ReadAllLines` загружает весь файл в массив.
:::

:::spoiler Чем `IEnumerable<T>` отличается от `List<T>`? (ловушка: «просто интерфейс против класса»)
`List<T>` хранит данные, имеет `Count`, индекс, `Add`. `IEnumerable<T>` — только возможность перебора; данные могут вычисляться на ходу, и каждый перебор может выполнять работу заново. Поэтому `IEnumerable` из запроса нельзя считать «снимком».
:::

:::spoiler Что делает `foreach` под капотом?
Вызывает `GetEnumerator()`, в цикле `while (e.MoveNext())` берёт `e.Current` и в конце вызывает `Dispose()` (через `using`). Для типов с подходящим публичным `GetEnumerator()` интерфейсы не обязательны.
:::

:::spoiler Когда выбросится исключение в итераторе с проверкой аргумента в начале?
Не при вызове метода, а при первом `MoveNext()` (первый шаг перебора). Чтобы проверять сразу, выноси проверку в обычный метод-обёртку, а итератор — во вложенную локальную функцию.
:::

:::spoiler Что произойдёт, если выйти из `foreach` по итератору через `break`?
Вызовется `Dispose()` перечислителя, а значит выполнятся блоки `finally` в итераторе — ресурсы будут освобождены.
:::

:::spoiler Можно ли в итераторе использовать `ref`-параметры или `yield return` внутри `try-catch`?
Нет: `ref`/`out` параметры в итераторах запрещены, а `yield return` внутри `try` с `catch` не компилируется (внутри `try-finally` — можно).
:::

## Что запомнить

- `IEnumerable<T>` — «можно перебрать»; `IEnumerator<T>` — курсор с `MoveNext`/`Current`; `foreach` = `GetEnumerator` + `MoveNext` + `Dispose`.
- `yield return` превращает метод в машину состояний: значения производятся по одному и по требованию.
- Вызов итератора ничего не выполняет — код идёт при переборе; исключения и побочные эффекты тоже откладываются.
- Бесконечные последовательности безопасны только с `Take`/`First`/`TakeWhile`.
- Запрос — рецепт, а не данные: дважды перебрал — дважды выполнил; нужно повторно — `ToList()`/`ToArray()`.
- Запрос видит изменения источника на момент перебора; снимок делает материализация.
- `break` в `foreach` вызывает `Dispose` → `finally` итератора → ресурсы закрываются.
- Проверку аргументов делай в внешнем методе, ленивую часть — во внутреннем итераторе.

## Практика

- [ ] Запустил пример с «старт / отдаю / получил» и объяснил порядок вывода
- [ ] Написал итератор `Fibonacci()` (бесконечный) и взял первые 20 чисел через `Take`
- [ ] Написал свой `MyWhere<T>(IEnumerable<T>, Func<T, bool>)` через `yield return` и проверил ленивость логами
- [ ] Воспроизвёл многократный перебор и исправил через `ToList()`
- [ ] Реализовал `IEnumerable<T>` вручную (класс-перечислитель с `MoveNext`/`Current`) для диапазона чисел — один раз, для понимания

@@page id="p2-linq" phase="2" kind="topic" title="LINQ: операторы, порядок выполнения, IEnumerable vs IQueryable" nav="LINQ под капотом" est="1,5–2 недели"
:::why
LINQ — язык работы с данными в C#: те же операторы ты будешь писать в EF Core против базы данных. Критерий фазы требует **цепочку из 3+ методов и объяснение порядка и момента выполнения**. Эта страница построена вокруг этого вопроса.
:::

## Зачем это нужно

Программы почти всегда делают одно и то же с данными: **отфильтровать, преобразовать, отсортировать, сгруппировать, посчитать**. До LINQ это были вложенные `foreach`, временные списки и флаги — длинно и легко ошибиться. LINQ (Language Integrated Query) даёт единый, читаемый язык для таких операций над любой последовательностью: массивом, списком, словарём, XML и (через EF Core) таблицей в базе данных.

Зачем тебе LINQ как будущему Junior .NET:

- **Это ежедневный инструмент.** В любом проекте десятки LINQ-запросов; код-ревью без понимания LINQ невозможно.
- **Он ведёт в EF Core.** Те же `Where/Select/OrderBy` в Фазе 3 превратятся в SQL. Знание того, *когда* и *где* выполняется запрос, определяет, загрузишь ты 10 строк или всю таблицу.
- **На собеседованиях** просят: «Выведи топ-3 авторов по сумме цен», «Объясни разницу между `IEnumerable` и `IQueryable`», «Что выведет этот отложенный запрос?»
- **Он влияет на производительность.** Лишний `Count() > 0`, повторный перебор или `ToList()` не в том месте стоят секунд и мегабайт.

Эта страница делает акцент на трёх вещах: как писать запросы, **как они выполняются** и чем `IEnumerable` отличается от `IQueryable`.

## Интуиция и аналогия

**Конвейер на фабрике.** Сырьё (последовательность данных) едет по ленте. На каждом станке с ним делают одну операцию: отбраковка (`Where`), перепаковка (`Select`), сортировка (`OrderBy`), упаковка десяти штук (`Take(10)`). Станков может быть сколько угодно, но лента одна: деталь проходит через все станки по очереди.

**Запрос — это заказ, а не готовая продукция.** Пока ты не «нажал кнопку» (`foreach`, `ToList`, `Count`), конвейер не запускается. Ты описал, что хочешь получить; делать будут потом — и каждый раз заново.

**Магазин и склад.** `IEnumerable` — когда ты сам едешь на склад, привозишь *всё* и разбираешь дома. `IQueryable` — когда ты звонишь на склад и говоришь «пришлите только красные куртки 46-го размера»: фильтрует склад, к тебе приезжает малое.

## Основная теория по шагам

### Шаг 1. Данные для примеров

Модель из пяти полей и шесть книг. Для краткости в примерах ниже она повторяется в каждом блоке.

~~~csharp
var books = Data.Books;
Console.WriteLine($"{books.Count} книг, авторов: {books.Select(b => b.Author).Distinct().Count()}");

public record Book(int Id, string Title, string Author, int Year, string Genre, decimal Price);

public static class Data
{
    public static readonly List<Book> Books = new()
    {
        new(1, "Мастер и Маргарита", "Булгаков", 1967, "Роман", 650m),
        new(2, "Собачье сердце", "Булгаков", 1987, "Повесть", 320m),
        new(3, "Преступление и наказание", "Достоевский", 1866, "Роман", 540m),
        new(4, "Идиот", "Достоевский", 1869, "Роман", 590m),
        new(5, "Шинель", "Гоголь", 1842, "Повесть", 210m),
        new(6, "Мёртвые души", "Гоголь", 1842, "Поэма", 480m),
    };
}
~~~
~~~console
6 книг, авторов: 3
~~~

### Шаг 2. Основные операторы

Фильтрация, проекция, сортировка — база любого запроса:

~~~csharp
var books = Data.Books;

var novels = books
    .Where(b => b.Genre == "Роман")
    .OrderBy(b => b.Year)
    .Select(b => $"{b.Year}: {b.Title}");
foreach (var n in novels) Console.WriteLine(n);

// сортировка по двум ключам: сначала автор, потом год по убыванию
foreach (var b in books.OrderBy(b => b.Author).ThenByDescending(b => b.Year))
    Console.WriteLine($"{b.Author,-12} {b.Year} {b.Title}");

public record Book(int Id, string Title, string Author, int Year, string Genre, decimal Price);
public static class Data
{
    public static readonly List<Book> Books = new()
    {
        new(1, "Мастер и Маргарита", "Булгаков", 1967, "Роман", 650m),
        new(2, "Собачье сердце", "Булгаков", 1987, "Повесть", 320m),
        new(3, "Преступление и наказание", "Достоевский", 1866, "Роман", 540m),
        new(4, "Идиот", "Достоевский", 1869, "Роман", 590m),
        new(5, "Шинель", "Гоголь", 1842, "Повесть", 210m),
        new(6, "Мёртвые души", "Гоголь", 1842, "Поэма", 480m),
    };
}
~~~
~~~console
1866: Преступление и наказание
1869: Идиот
1967: Мастер и Маргарита
Булгаков     1987 Собачье сердце
Булгаков     1967 Мастер и Маргарита
Гоголь       1842 Шинель
Гоголь       1842 Мёртвые души
Достоевский  1869 Идиот
Достоевский  1866 Преступление и наказание
~~~

Агрегаты и проверки:

~~~csharp
var books = Data.Books;

int count = books.Count(b => b.Price > 500m);
decimal avg = books.Average(b => b.Price);
bool anyOld = books.Any(b => b.Year < 1850);
bool allPriced = books.All(b => b.Price > 0m);
Console.WriteLine($"дороже 500: {count}; средняя цена: {avg}; есть старше 1850: {anyOld}; все с ценой: {allPriced}");
Console.WriteLine($"макс: {books.Max(b => b.Price)}, сумма: {books.Sum(b => b.Price)}");
Console.WriteLine(books.MaxBy(b => b.Price)!.Title);          // элемент с максимальным значением
Console.WriteLine(books.MinBy(b => b.Year)!.Title);

// Один элемент
Book first = books.First(b => b.Author == "Гоголь");
Book? none = books.FirstOrDefault(b => b.Author == "Пушкин");
Console.WriteLine($"{first.Title}; {none is null}");
try { books.Single(b => b.Author == "Булгаков"); }          // их двое → исключение
catch (InvalidOperationException) { Console.WriteLine("Single: больше одного"); }
try { books.First(b => b.Author == "Пушкин"); }              // нет ни одного → исключение
catch (InvalidOperationException) { Console.WriteLine("First: ничего не найдено"); }

public record Book(int Id, string Title, string Author, int Year, string Genre, decimal Price);
public static class Data
{
    public static readonly List<Book> Books = new()
    {
        new(1, "Мастер и Маргарита", "Булгаков", 1967, "Роман", 650m),
        new(2, "Собачье сердце", "Булгаков", 1987, "Повесть", 320m),
        new(3, "Преступление и наказание", "Достоевский", 1866, "Роман", 540m),
        new(4, "Идиот", "Достоевский", 1869, "Роман", 590m),
        new(5, "Шинель", "Гоголь", 1842, "Повесть", 210m),
        new(6, "Мёртвые души", "Гоголь", 1842, "Поэма", 480m),
    };
}
~~~
~~~console
дороже 500: 3; средняя цена: 465; есть старше 1850: True; все с ценой: True
макс: 650, сумма: 2790
Мастер и Маргарита
Шинель
Шинель; True
Single: больше одного
First: ничего не найдено
~~~

:::tip `First` / `FirstOrDefault` / `Single`
- `First` — нужен первый, и он **обязан** быть (иначе исключение).
- `FirstOrDefault` — может не быть, вернётся `default` (`null` для классов) — проверь результат.
- `Single` — элемент **ровно один**; если 0 или больше 1 — исключение. Полезно для поиска по уникальному ключу как проверка инварианта.
- `SingleOrDefault` — ноль или один; больше одного — исключение.
:::

### Шаг 3. Группировка, словари, пагинация, `SelectMany`

~~~csharp
var books = Data.Books;

var byAuthor = books
    .GroupBy(b => b.Author)
    .Select(g => new { Author = g.Key, Count = g.Count(), Total = g.Sum(b => b.Price) })
    .OrderByDescending(x => x.Total);
foreach (var a in byAuthor) Console.WriteLine($"{a.Author}: {a.Count} шт., {a.Total} ₽");

Dictionary<int, Book> byId = books.ToDictionary(b => b.Id);                 // быстрый поиск по Id
Console.WriteLine(byId[4].Title);

ILookup<string, Book> byGenre = books.ToLookup(b => b.Genre);              // как словарь «ключ → много значений»
Console.WriteLine(string.Join(", ", byGenre["Повесть"].Select(b => b.Title)));
Console.WriteLine(byGenre["Детектив"].Count());                              // нет ключа → пусто, без исключения

var page2 = books.OrderBy(b => b.Id).Skip(2).Take(2);                       // пагинация: 3-я и 4-я
Console.WriteLine(string.Join(", ", page2.Select(b => b.Id)));

var tags = new[] { new[] { "классика", "роман" }, new[] { "сатира" } }.SelectMany(x => x);   // «расплющить»
Console.WriteLine(string.Join(", ", tags));

foreach (var chunk in books.Select(b => b.Id).Chunk(4)) Console.WriteLine(string.Join(",", chunk));   // порции

public record Book(int Id, string Title, string Author, int Year, string Genre, decimal Price);
public static class Data
{
    public static readonly List<Book> Books = new()
    {
        new(1, "Мастер и Маргарита", "Булгаков", 1967, "Роман", 650m),
        new(2, "Собачье сердце", "Булгаков", 1987, "Повесть", 320m),
        new(3, "Преступление и наказание", "Достоевский", 1866, "Роман", 540m),
        new(4, "Идиот", "Достоевский", 1869, "Роман", 590m),
        new(5, "Шинель", "Гоголь", 1842, "Повесть", 210m),
        new(6, "Мёртвые души", "Гоголь", 1842, "Поэма", 480m),
    };
}
~~~
~~~console
Достоевский: 2 шт., 1130 ₽
Булгаков: 2 шт., 970 ₽
Гоголь: 2 шт., 690 ₽
Идиот
Собачье сердце, Шинель
0
3, 4
классика, роман, сатира
1,2,3,4
5,6
~~~

`ToDictionary` бросает исключение, если ключи повторяются (для неуникальных используй `ToLookup` или `GroupBy`).

### Шаг 4. Соединение коллекций: `Join`, `GroupJoin`, `Zip`

~~~csharp
var authors = new[] { new Author(1, "Булгаков"), new Author(2, "Гоголь"), new Author(3, "Чехов") };
var books = new[] { new B("Шинель", 2), new B("Собачье сердце", 1), new B("Мастер и Маргарита", 1) };

// внутреннее соединение (INNER JOIN): только пары с совпадением
var pairs = books.Join(authors, b => b.AuthorId, a => a.Id, (b, a) => $"{a.Name}: {b.Title}");
Console.WriteLine(string.Join(" | ", pairs.OrderBy(x => x)));

// GroupJoin — левое соединение: у Чехова книг нет, но он в результате остаётся
var left = authors.GroupJoin(books, a => a.Id, b => b.AuthorId, (a, bs) => $"{a.Name}={bs.Count()}");
Console.WriteLine(string.Join(", ", left));

// Zip: попарно по позиции
Console.WriteLine(string.Join(", ", new[] { 1, 2, 3 }.Zip(new[] { "a", "b", "c" }, (n, s) => $"{n}{s}")));

record Author(int Id, string Name);
record B(string Title, int AuthorId);
~~~
~~~console
Булгаков: Мастер и Маргарита | Булгаков: Собачье сердце | Гоголь: Шинель
Булгаков=2, Гоголь=1, Чехов=0
1a, 2b, 3c
~~~

### Шаг 5. Синтаксис запросов

~~~csharp
var q = from b in Data.Books
        where b.Price > 400m
        orderby b.Author, b.Year descending
        let label = $"{b.Author}: {b.Title}"          // let — именованное промежуточное значение
        select label;
foreach (var s in q) Console.WriteLine(s);
// Компилятор переводит это в .Where(...).OrderBy(...).ThenByDescending(...).Select(...)

public record Book(int Id, string Title, string Author, int Year, string Genre, decimal Price);
public static class Data
{
    public static readonly List<Book> Books = new()
    {
        new(1, "Мастер и Маргарита", "Булгаков", 1967, "Роман", 650m),
        new(2, "Собачье сердце", "Булгаков", 1987, "Повесть", 320m),
        new(3, "Преступление и наказание", "Достоевский", 1866, "Роман", 540m),
        new(4, "Идиот", "Достоевский", 1869, "Роман", 590m),
        new(5, "Шинель", "Гоголь", 1842, "Повесть", 210m),
        new(6, "Мёртвые души", "Гоголь", 1842, "Поэма", 480m),
    };
}
~~~
~~~console
Булгаков: Мастер и Маргарита
Гоголь: Мёртвые души
Достоевский: Идиот
Достоевский: Преступление и наказание
~~~

Оба синтаксиса компилируются в одни и те же вызовы. В командах чаще пишут методами; синтаксис запросов удобен для `join` и `let`.

### Шаг 6. Главный вопрос: когда и в каком порядке выполняется цепочка {#order}

~~~csharp
var numbers = new[] { 1, 2, 3, 4, 5, 6 };

var query = numbers
    .Where(n => { Console.WriteLine($"  Where  {n}"); return n % 2 == 0; })
    .Select(n => { Console.WriteLine($"  Select {n}"); return n * 10; })
    .Take(2);

Console.WriteLine("Запрос создан");          // ← ни одной строчки Where/Select выше нет!

foreach (var x in query)
    Console.WriteLine($"→ {x}");
~~~
~~~console
Запрос создан
  Where  1
  Where  2
  Select 2
→ 20
  Where  3
  Where  4
  Select 4
→ 40
~~~

Что здесь видно — и это ответ для критерия:

1. **Отложенное выполнение.** `Where`, `Select`, `Take` ничего не делают при вызове: они строят цепочку обёрток-итераторов. Работа начинается на `foreach` (или `ToList`, `Count`, `First`…).
2. **Поэлементная «протяжка» (pull).** `foreach` просит элемент у `Take`, тот — у `Select`, тот — у `Where`, тот — у массива. Каждый элемент проходит **всю цепочку**, прежде чем берётся следующий. Поэтому `Where().Select()` **не создаёт промежуточных коллекций**.
3. **Ранняя остановка.** `Take(2)` после второго элемента перестаёт запрашивать данные: 5 и 6 даже не проверялись.

~~~text Цепочка обёрток
foreach ──MoveNext()──▶ Take ──MoveNext()──▶ Select ──MoveNext()──▶ Where ──MoveNext()──▶ массив
        ◀── 20 ─────────     ◀── 20 ──────────       ◀── 2 ───────────      ◀── 1, 2 ──────
~~~

#### Операторы, которые всё-таки буферизуют

`OrderBy`, `GroupBy`, `Reverse`, `ToList`, `ToDictionary`, `Count()`, `Sum()` должны увидеть **всю** последовательность, прежде чем отдать результат. Поставь `OrderBy` в цепочку выше — и увидишь, что все `Where` выполнятся до первого `→`:

~~~csharp
var numbers = new[] { 5, 2, 8, 1 };

var q = numbers
    .Where(n => { Console.WriteLine($"  Where  {n}"); return n > 1; })
    .OrderBy(n => n)                                                  // буферизует ВСЁ
    .Select(n => { Console.WriteLine($"  Select {n}"); return n * 10; });

foreach (var x in q) Console.WriteLine($"→ {x}");
~~~
~~~console
  Where  5
  Where  2
  Where  8
  Where  1
  Select 2
→ 20
  Select 5
→ 50
  Select 8
→ 80
~~~

А вот `Distinct` — поточный: каждый новый элемент отдаётся сразу, как только увиден (хранится лишь множество уже встреченных):

~~~csharp
var seq = new[] { 1, 2, 1, 3, 2 }.Select(n => { Console.WriteLine($"  читаю {n}"); return n; }).Distinct();
foreach (var x in seq.Take(2)) Console.WriteLine($"→ {x}");     // остановились после двух уникальных
~~~
~~~console
  читаю 1
→ 1
  читаю 2
→ 2
~~~

| Отложенные, потоковые | Отложенные, но буферизующие при переборе | Немедленные |
|---|---|---|
| `Where`, `Select`, `SelectMany`, `Take`, `Skip`, `Concat`, `Distinct`, `Zip` | `OrderBy`, `GroupBy`, `Reverse`; `Join` (буферизует внутреннюю последовательность) | `ToList`, `ToArray`, `ToDictionary`, `Count`, `Sum`, `Max`, `First`, `Any`, `Single` |

#### Порядок операторов важен

Одни и те же операторы в разном порядке дают разный результат — и разную стоимость:

~~~csharp
var nums = new[] { 5, 3, 8, 1, 9, 2 };

// Take до OrderBy — берём первые 3 по порядку в массиве, потом сортируем только их
Console.WriteLine(string.Join(",", nums.Take(3).OrderBy(n => n)));
// OrderBy до Take — сортируем всё, потом берём 3 наименьших
Console.WriteLine(string.Join(",", nums.OrderBy(n => n).Take(3)));

// Where до Select — Select вызывается только для подходящих
int selectCalls = 0;
_ = nums.Select(n => { selectCalls++; return n * 2; }).Where(x => x > 10).ToList();
Console.WriteLine($"Select → Where: Select вызван {selectCalls} раз");
selectCalls = 0;
_ = nums.Where(n => n * 2 > 10).Select(n => { selectCalls++; return n * 2; }).ToList();
Console.WriteLine($"Where → Select: Select вызван {selectCalls} раз");
~~~
~~~console
3,5,8
1,2,3
Select → Where: Select вызван 6 раз
Where → Select: Select вызван 2 раз
~~~

Правило: **сначала сужай (`Where`), потом преобразуй (`Select`)**, дорогие операции (сортировка) — после фильтра.

#### Ловушка: запрос «видит» изменения и захваченные переменные

~~~csharp
var list = new List<int> { 1, 2, 3 };
int min = 1;
var big = list.Where(n => n > min);   // лямбда захватила переменную min, а не её значение

min = 2;
list.Add(4);
Console.WriteLine(string.Join(",", big));   // учтены и новый min, и новый элемент

var snapshot = big.ToList();                 // фиксируем результат сейчас
list.Add(5);
Console.WriteLine(string.Join(",", snapshot));
~~~
~~~console
3,4
3,4
~~~

### Шаг 7. `IEnumerable<T>` против `IQueryable<T>` {#iqueryable}

| | `IEnumerable<T>` (LINQ to Objects) | `IQueryable<T>` (EF Core и др.) |
|---|---|---|
| Где выполняется | в памяти процесса, твоим C#-кодом | у **провайдера**: обычно переводится в SQL |
| Что принимает `Where` | делегат `Func<T, bool>` — готовый код | дерево выражений `Expression<Func<T, bool>>` — описание кода |
| Что можно писать в лямбде | любой C# | только то, что провайдер умеет перевести |

~~~csharp
using System.Linq.Expressions;   // Expression<T> не входит в implicit usings

Func<Book, bool> asCode = b => b.Price > 500m;               // скомпилированный метод
Expression<Func<Book, bool>> asData = b => b.Price > 500m;   // дерево: «свойство Price > константа 500»
Console.WriteLine(asData);
Console.WriteLine(asData.Body.NodeType);                      // GreaterThan — узел дерева, а не результат
Console.WriteLine(asCode(new Book(1, "A", "B", 2000, "Роман", 600m)));
Console.WriteLine(asData.Compile()(new Book(1, "A", "B", 2000, "Роман", 100m)));   // дерево можно скомпилировать в код

// IQueryable можно получить и в памяти — AsQueryable(); он принимает деревья, но исполняет их тут же
IQueryable<Book> q = new[] { new Book(1, "A", "B", 2000, "Роман", 600m) }.AsQueryable();
Console.WriteLine(q.Where(b => b.Price > 500m).Count());

public record Book(int Id, string Title, string Author, int Year, string Genre, decimal Price);
~~~
~~~console
b => (b.Price > 500)
GreaterThan
True
False
1
~~~

EF Core (Фаза 3) получает **дерево выражений** и переводит его в SQL: `WHERE "Price" > 500`. Отсюда главная ловушка:

~~~csharp
// db.Books — IQueryable<Book>
// ❌ AsEnumerable()/ToList() слишком рано: вся таблица загружается в память, фильтр — в C#
// var expensive = db.Books.ToList().Where(b => b.Price > 500m);

// ✅ фильтр и сортировка — в SQL, в память приходят только нужные строки
// var expensive = db.Books.Where(b => b.Price > 500m).OrderBy(b => b.Title).ToList();
~~~

Эта страница даёт идею. Подробно и на живой базе — в Фазе 3.

:::deep Граница
Устройство деревьев выражений, написание своего LINQ-провайдера, оптимизации LINQ в разных версиях .NET — не нужно. Достаточно: `IEnumerable` — делегаты и выполнение в памяти, `IQueryable` — деревья выражений и перевод провайдером.
:::

### Шаг 8. Производительность LINQ: практические привычки

~~~csharp
var data = Enumerable.Range(1, 1_000_000).ToList();
int calls = 0;

IEnumerable<int> Produce()                     // «дорогой» ленивый источник
{
    foreach (var x in data) { calls++; yield return x; }
}

bool exists = Produce().Any();                 // остановился на первом элементе
Console.WriteLine($"Any: вызовов {calls}");

calls = 0;
bool exists2 = Produce().Count() > 0;          // перебрал всё
Console.WriteLine($"Count() > 0: вызовов {calls:N0}");

// у готовой коллекции Count() — это свойство, перебора нет
Console.WriteLine(data.Count());
~~~
~~~console
Any: вызовов 1
Count() > 0: вызовов 1,000,000
1000000
~~~

Привычки:

- `Any()` вместо `Count() > 0`; `Exists`/`Contains` у коллекции, если она есть.
- Не вызывай `Count()`, `First()`, `ToList()` на одном ленивом запросе несколько раз — материализуй один раз.
- Дорогие операции (`OrderBy`, `GroupBy`) — после `Where`.
- В горячем коде (миллионы вызовов) обычный `foreach` может быть заметно быстрее LINQ — из-за делегатов и аллокаций; но для обычного бизнес-кода читаемость важнее.

## Как это работает под капотом

- **Методы расширения над `IEnumerable<T>`.** LINQ — это статический класс `Enumerable` с методами расширения (`Where`, `Select`…). `source.Where(p)` — это `Enumerable.Where(source, p)`; каждый возвращает новый итератор-обёртку над предыдущим (см. [итераторы](#p2-iterators)).
- **Лямбда → делегат или дерево.** Для `IEnumerable` компилятор превращает лямбду в метод и создаёт делегат `Func<T,bool>`. Для `IQueryable` — строит объект `Expression<Func<T,bool>>`, описывающий выражение: узлы «параметр», «доступ к свойству», «константа», «сравнение».
- **Захваченные переменные.** Лямбда, ссылающаяся на локальную переменную, превращается в метод класса-«замыкания», в поле которого лежит *сама переменная* (а не её копия). Поэтому изменение переменной после создания запроса влияет на результат, и поэтому в `foreach` с лямбдой в цикле раньше случались сюрпризы (в современном C# переменная `foreach` создаётся заново на каждой итерации).
- **Сцепление.** `Where(...).Select(...)` в .NET часто объединяется в один итератор (`WhereSelectArrayIterator`, `WhereSelectListIterator`) — меньше вызовов и аллокаций; для пользователя поведение идентично описанному «протягиванию».
- **`OrderBy` — устойчивая сортировка с буфером.** При первом `MoveNext()` вытягивает все элементы, считает ключи один раз и сортирует массив индексов; `ThenBy` добавляет к тому же компаратору вторичный ключ.
- **`GroupBy`/`ToLookup`** строят хэш-таблицу «ключ → группа»; группы сохраняют порядок первого появления ключа и порядок элементов.
- **`Join`** загружает внутреннюю последовательность в хэш-таблицу по ключу (O(m)), а внешнюю перебирает потоково — итого O(n + m), а не O(n·m) вложенных циклов.
- **EF Core.** Цепочка `Where/Select/OrderBy` над `IQueryable` накапливает дерево выражений; при материализации провайдер переводит его в SQL и выполняет в базе. Если часть выражения перевести нельзя, в современных версиях EF Core выбросит исключение, а не будет молча тянуть всё в память.

Справочник: [основы LINQ](#/ref/e/co-linq-basics), [отложенное выполнение](#/ref/e/co-linq-deferred), [производительность LINQ](#/ref/e/co-linq-perf).

## Типичные ошибки и ловушки

:::danger `Count() > 0` вместо `Any()`
`Count()` у последовательности проходит всё; `Any()` останавливается на первом элементе. Для `IQueryable` это ещё и разный SQL.
:::

:::danger `First()` там, где элемента может не быть
`InvalidOperationException: Sequence contains no matching element`. Если отсутствие нормально — `FirstOrDefault()` и проверка на `null`.
:::

:::danger Побочные эффекты внутри лямбд
`Select(b => { counter++; return b; })` выполнится столько раз, сколько раз перебирают запрос, — и в неожиданный момент. Лямбды в LINQ должны быть чистыми.
:::

- **`ToList()` слишком рано на `IQueryable`.** Таблица грузится в память целиком, фильтр работает в C#.
- **Множественный перебор.** Дважды перебрал — дважды выполнил (в БД — два запроса).
- **Запрос после закрытия контекста/потока.** Ленивый запрос выполняется при переборе; если источник уже закрыт — ошибка. Материализуй до закрытия.
- **`Single` вместо `First`.** `Single` требует ровно один; при дубликатах упадёт. Выбирай осознанно: `Single` — это проверка инварианта.
- **`ToDictionary` с дублями ключей.** `ArgumentException`; для неуникальных — `ToLookup`/`GroupBy`.
- **Функции, не переводимые в SQL.** Свой метод в `Where` для `IQueryable` провайдер не поймёт — вызов нужно сделать до запроса или переписать на выражение.
- **Сортировка ради максимума.** `OrderBy(x => x.P).First()` — O(n log n); `MaxBy`/`MinBy` — O(n).
- **Сравнение строк без учёта культуры.** В `Where(b => b.Title == "x")` по умолчанию порядковое сравнение; для регистронезависимого — `StringComparison.OrdinalIgnoreCase`.
- **Злоупотребление цепочками.** Запрос из 15 вложенных операторов нечитаем; разбивай на именованные промежуточные переменные или методы.
- **`Select` ради побочного эффекта.** Для действия над каждым элементом используй `foreach`, а не `Select(...).ToList()`.

## Вопросы с собеседований

:::spoiler Объясни вывод примера с `Where/Select/Take` (вопрос из критерия)
Операторы отложенные: при объявлении строится цепочка итераторов, ничего не выполняется. `foreach` вытягивает элементы по одному через всю цепочку: `Where` проверяет 1 (не подходит), 2 (подходит) → `Select` превращает в 20 → `Take` отдаёт. После второго элемента `Take` прекращает запросы, поэтому 5 и 6 не обрабатываются. Промежуточных коллекций нет.
:::

:::spoiler Что изменится, если добавить `OrderBy` перед `Select`?
`OrderBy` буферизующий: при первом запросе элемента он вытянет **все** элементы из `Where` (все строчки «Where» напечатаются сразу), отсортирует и только потом начнёт отдавать элементы дальше в `Select`.
:::

:::spoiler Чем `IQueryable` отличается от `IEnumerable` с точки зрения выполнения?
`IEnumerable` выполняет делегаты в памяти. `IQueryable` накапливает дерево выражений, которое провайдер (например, EF Core) переводит в запрос к источнику (SQL) и выполняет там при материализации.
:::

:::spoiler Почему `db.Books.ToList().Where(...)` — плохо?
`ToList()` материализует всю таблицу в память, и фильтр выполняется уже в C#. Нужно сначала фильтровать на `IQueryable`, чтобы фильтр попал в SQL.
:::

:::spoiler Чем `First` отличается от `Single` и `FirstOrDefault`? (ловушка: «они почти одинаковые»)
`First` — первый, исключение если нет; `FirstOrDefault` — первый или `default`; `Single` — ровно один (исключение при 0 и при >1), `SingleOrDefault` — ноль или один. `Single` выражает «по контракту ровно один» и ловит дубликаты.
:::

:::spoiler Почему `Any()` лучше `Count() > 0`?
`Any()` останавливается на первом элементе (O(1) в лучшем случае), `Count()` у ленивой последовательности перебирает всё (O(n)); в SQL — `EXISTS` против `COUNT(*)`.
:::

:::spoiler Что такое отложенное выполнение и когда запрос реально исполняется?
Операторы вроде `Where`/`Select` лишь строят запрос; он исполняется при переборе (`foreach`), либо при вызове немедленных операторов: `ToList`, `ToArray`, `Count`, `First`, `Sum`, `Any`…
:::

:::spoiler Как устроен `Join` и какая у него сложность?
Внутренняя последовательность загружается в хэш-таблицу по ключу, внешняя перебирается потоково с поиском в таблице. Итого O(n + m), а не O(n·m).
:::

:::spoiler `OrderBy().ThenBy()` против двух `OrderBy` подряд — есть разница?
Есть. `ThenBy` добавляет вторичный ключ к той же сортировке. Два `OrderBy` подряд: второй пересортирует всё по новому ключу, а порядок первого сохранится лишь для равных элементов (сортировка устойчива) — читается неочевидно, лучше `ThenBy`.
:::

## Что запомнить

- LINQ — набор операторов над `IEnumerable<T>`: `Where`, `Select`, `OrderBy`, `GroupBy`, `Join`, `Any`, `Count`, `First`…
- Запрос отложен: строится цепочка итераторов, выполняется при переборе или немедленном операторе; элементы протягиваются по одному.
- Поточные операторы не создают промежуточных коллекций; `OrderBy`/`GroupBy`/`Reverse` буферизуют; `Join` буферизует внутреннюю последовательность.
- Порядок операторов важен: сначала `Where`, потом `Select`/`OrderBy`; `Take` до или после сортировки даёт разное.
- Запрос видит изменения источника и захваченных переменных; снимок — `ToList()`.
- `Any()` вместо `Count() > 0`; `First` / `FirstOrDefault` / `Single` выбираем осознанно.
- `IEnumerable` — делегаты в памяти; `IQueryable` — деревья выражений, которые провайдер (EF Core) переводит в SQL; не вызывай `ToList()` раньше времени.
- Лямбды в запросах должны быть чистыми; материализуй перед закрытием источника.

## Практика

- [ ] Запустил пример с логированием `Where/Select/Take`, потом добавил `OrderBy` и объяснил разницу в выводе
- [ ] Написал 10 запросов к `Data.Books`: фильтр, сортировка по двум ключам, группировка, топ-3, пагинация, `ToDictionary`, `Any/All`, `Sum/Average`, `SelectMany`, `Join` двух коллекций
- [ ] Переписал 3 запроса из синтаксиса методов в синтаксис запросов и обратно
- [ ] Воспроизвёл захват переменной в лямбде и объяснил результат
- [ ] Вывел в консоль `Expression<Func<Book, bool>>` и сравнил с `Func<Book, bool>`
- [ ] Записал голосовую заметку: «моя цепочка из 3+ методов, порядок и момент выполнения»

@@page id="p2-algorithms" phase="2" kind="topic" title="Алгоритмы: бинарный поиск, сортировки, рекурсия" nav="Алгоритмы" est="~1 неделя"
:::why
Цель — не реализовать quicksort 10 раз, а понимать идеи: почему бинарный поиск — O(log n), чем стабильная сортировка отличается от нестабильной, как устроена рекурсия и когда она ломается. Эти идеи встречаются в задачах на собеседовании и при чтении чужого кода.
:::

## Зачем это нужно

На работе ты почти никогда не пишешь сортировку или бинарный поиск с нуля: в .NET есть `Array.Sort`, `List<T>.BinarySearch`, LINQ. Тогда зачем изучать алгоритмы?

- **Чтобы понимать, что делают готовые инструменты.** Почему `BinarySearch` возвращает отрицательное число? Почему `List.Sort` не сохраняет порядок равных элементов, а `OrderBy` сохраняет? Почему вставка в середину списка дорогая? Ответы лежат в идеях алгоритмов.
- **Чтобы мыслить сложностью.** «Разделяй и властвуй», «две точки», «запомни результат» — это приёмы, которые применимы к любым задачам, а не только к сортировкам.
- **Чтобы пройти собеседование.** Задачи вида «найди индекс в отсортированном массиве», «обойди дерево папок», «посчитай число способов» — стандарт для Junior. Их решает владение тремя-четырьмя идеями: бинарный поиск, рекурсия, стек/очередь, словарь (последний уже был).
- **Чтобы узнавать подходящий случай.** Видя «данные отсортированы» — вспоминаешь бинарный поиск; «структура вложенная» — рекурсия или стек; «одно и то же считается много раз» — запоминание (мемоизация).
- **Чтобы не уронить прод.** Рекурсия без границы и сортировка с неверным компаратором — реальные источники падений и «странного порядка».

Эта страница — про идеи и умение объяснить сложность вслух, а не про заучивание кода.

## Интуиция и аналогия

**Бинарный поиск — угадай число.** Загадано число от 1 до 100. Спрашиваешь «больше 50?» — и сразу отбрасываешь половину. За 7 вопросов угадаешь любое. Это и есть O(log n): каждый вопрос делит область поиска пополам. Условие: у чисел есть порядок (массив отсортирован).

**Сортировка слиянием — раскладка колод.** Есть две отсортированные стопки карт. Сливаешь их в одну, сравнивая верхние карты: берёшь меньшую, повторяешь. Чтобы получить две отсортированные стопки из одной несортированной — разделяй пополам, пока в стопке не останется одна карта (она отсортирована сама по себе), и сливай обратно.

**Быстрая сортировка — выбор «опоры».** Берёшь одного человека в классе и говоришь: «Кто ниже — налево, кто выше — направо». Потом с каждой группой делаешь то же самое. Если опорным оказывается самый высокий каждый раз, группы получаются неравные (0 и n−1), и работа растёт до O(n²).

**Рекурсия — матрёшки.** Открыл матрёшку — внутри такая же, только меньше. Остановился, когда внутри пусто (базовый случай). Если нет «самой маленькой» — будешь открывать бесконечно.

## Основная теория по шагам

### Шаг 1. Бинарный поиск — напиши руками

~~~csharp
int[] sorted = { 3, 8, 15, 23, 42, 57, 91 };
Console.WriteLine(BinarySearch(sorted, 42));
Console.WriteLine(BinarySearch(sorted, 10));

// граничные случаи
Console.WriteLine(BinarySearch(Array.Empty<int>(), 5));     // пустой
Console.WriteLine(BinarySearch(new[] { 7 }, 7));              // один элемент
Console.WriteLine(BinarySearch(sorted, 3));                   // первый
Console.WriteLine(BinarySearch(sorted, 91));                  // последний
Console.WriteLine(BinarySearch(sorted, 1));                   // меньше минимума
Console.WriteLine(BinarySearch(sorted, 1000));                // больше максимума

static int BinarySearch(int[] a, int target)
{
    int lo = 0, hi = a.Length - 1;
    while (lo <= hi)
    {
        int mid = lo + (hi - lo) / 2;          // не (lo + hi) / 2 — защита от переполнения
        if (a[mid] == target) return mid;
        if (a[mid] < target) lo = mid + 1;     // искомое правее
        else hi = mid - 1;                     // искомое левее
    }
    return -1;
}
~~~
~~~console
4
-1
-1
0
0
6
-1
-1
~~~

Каждый шаг отбрасывает половину оставшихся элементов: 1 000 000 → 500 000 → … → 1 примерно за 20 шагов. Отсюда O(log n). **Условие: массив отсортирован.** В .NET есть готовые `Array.BinarySearch` и `List<T>.BinarySearch`.

:::warn Граничные условия
Ошибки бинарного поиска почти всегда в границах: `<` против `<=`, `mid` против `mid ± 1`. Проверь свою реализацию на пустом массиве, одном элементе, первом и последнем элементе и на отсутствующем значении меньше минимума и больше максимума.
:::

Посчитаем шаги, чтобы увидеть логарифм:

~~~csharp
foreach (int n in new[] { 1_000, 1_000_000, 100_000_000 })
{
    int steps = 0;
    int lo = 0, hi = n - 1, target = n - 1;      // худший случай: ищем последний
    while (lo <= hi)
    {
        steps++;
        int mid = lo + (hi - lo) / 2;
        if (mid == target) break;
        if (mid < target) lo = mid + 1; else hi = mid - 1;
    }
    Console.WriteLine($"n = {n,11:N0}: шагов {steps}");
}
~~~
~~~console
n =       1,000: шагов 10
n =   1,000,000: шагов 20
n = 100,000,000: шагов 27
~~~

Стомиллионный массив ищется за ~27 шагов. Линейный поиск сделал бы до ста миллионов.

#### Вариант: «куда вставить» (lower bound)

Популярная задача (Search Insert Position): найти индекс, на который нужно вставить значение, чтобы сохранить порядок. Это то же самое, что `~BinarySearch(...)`, когда элемента нет, — и мы уже видели это в [теме про список](#p2-list).

~~~csharp
int[] a = { 1, 3, 5, 6 };
Console.WriteLine($"{LowerBound(a, 5)} {LowerBound(a, 2)} {LowerBound(a, 7)} {LowerBound(a, 0)}");

// первый индекс, где a[i] >= target (или a.Length, если таких нет)
static int LowerBound(int[] a, int target)
{
    int lo = 0, hi = a.Length;                  // hi — «за концом», поэтому условие lo < hi
    while (lo < hi)
    {
        int mid = lo + (hi - lo) / 2;
        if (a[mid] < target) lo = mid + 1;
        else hi = mid;
    }
    return lo;
}

// сравним со встроенным
Console.WriteLine($"{~Array.BinarySearch(a, 2)} {~Array.BinarySearch(a, 7)}");
~~~
~~~console
2 1 4 0
1 4
~~~

Две формы цикла (`lo <= hi` с `hi = n − 1` и `lo < hi` с `hi = n`) — обе рабочие; главное не смешивать их.

### Шаг 2. Сортировки: идеи

| Алгоритм | Идея | Время (среднее / худшее) | Память | Стабильная |
|---|---|---|---|---|
| Пузырьком / вставками | меняем соседей / вставляем в отсортированную часть | O(n²) / O(n²) | O(1) | да |
| Merge sort | разделить пополам, отсортировать половины, **слить** | O(n log n) / O(n log n) | O(n) | да |
| Quicksort | выбрать опорный элемент, разложить на «меньше/больше», рекурсивно | O(n log n) / O(n²) | O(log n) стек | нет |
| `Array.Sort` / `List.Sort` в .NET | introsort: quicksort + heapsort + вставки | O(n log n) / O(n log n) | O(log n) | **нет** |
| `OrderBy` в LINQ | — | O(n log n) | O(n) | **да** |

**Стабильная сортировка** сохраняет исходный порядок равных элементов. Это важно при сортировке по нескольким ключам: отсортировал по автору → потом стабильно по году — авторы внутри года остались по порядку. В LINQ для этого используют `OrderBy(...).ThenBy(...)`.

~~~csharp Merge sort — один раз написать для понимания
int[] data = { 38, 27, 43, 3, 9, 82, 10 };
Console.WriteLine(string.Join(", ", MergeSort(data)));

static int[] MergeSort(int[] a)
{
    if (a.Length <= 1) return a;                         // базовый случай
    int mid = a.Length / 2;
    int[] left = MergeSort(a[..mid]);                    // рекурсия на половинах
    int[] right = MergeSort(a[mid..]);
    return Merge(left, right);
}

static int[] Merge(int[] l, int[] r)
{
    var result = new int[l.Length + r.Length];
    int i = 0, j = 0, k = 0;
    while (i < l.Length && j < r.Length)
        result[k++] = l[i] <= r[j] ? l[i++] : r[j++];   // <= сохраняет стабильность
    while (i < l.Length) result[k++] = l[i++];
    while (j < r.Length) result[k++] = r[j++];
    return result;
}
~~~
~~~console
3, 9, 10, 27, 38, 43, 82
~~~

Идея Quicksort — тоже «разделяй и властвуй», но работа делается при разбиении, а не при слиянии:

~~~csharp
var a = new[] { 9, 4, 7, 1, 8, 2, 6 };
QuickSort(a, 0, a.Length - 1);
Console.WriteLine(string.Join(", ", a));

static void QuickSort(int[] a, int lo, int hi)
{
    if (lo >= hi) return;                  // базовый случай: 0 или 1 элемент
    int p = Partition(a, lo, hi);
    QuickSort(a, lo, p - 1);
    QuickSort(a, p + 1, hi);
}

static int Partition(int[] a, int lo, int hi)
{
    int pivot = a[hi], i = lo;                         // опорный — последний элемент
    for (int j = lo; j < hi; j++)
        if (a[j] < pivot) { (a[i], a[j]) = (a[j], a[i]); i++; }
    (a[i], a[hi]) = (a[hi], a[i]);                      // ставим опору на своё место
    return i;
}
~~~
~~~console
1, 2, 4, 6, 7, 8, 9
~~~

Quicksort сортирует «на месте» (почти без доп. памяти), но при плохом выборе опоры (например, всегда последний элемент на уже отсортированных данных) деградирует до O(n²). Поэтому в .NET используется **introsort**: быстрая сортировка, которая при слишком глубокой рекурсии переключается на пирамидальную (худший случай O(n log n)), а на коротких кусках — на сортировку вставками.

### Шаг 3. Устойчивость на практике

~~~csharp
var books = Enumerable.Range(0, 40)
    .Select(i => new B(Id: i, Year: 1900 + i % 3))          // много книг с одинаковым годом
    .ToList();

bool Stable(IEnumerable<B> sorted)
{
    B? prev = null;
    foreach (var b in sorted)
    {
        if (prev is not null && prev.Year == b.Year && prev.Id > b.Id) return false;
        prev = b;
    }
    return true;
}

var linq = books.OrderBy(b => b.Year).ToList();                        // устойчивая
Console.WriteLine($"OrderBy сохранил порядок равных: {Stable(linq)}");

var sortedList = new List<B>(books);
sortedList.Sort((x, y) => x.Year.CompareTo(y.Year));                  // не гарантирует устойчивость
Console.WriteLine($"List.Sort — гарантия отсутствует; порядок сохранён случайно: {Stable(sortedList)}");

// надёжный способ сделать List.Sort устойчивой: добавить второй ключ
sortedList.Sort((x, y) => x.Year != y.Year ? x.Year.CompareTo(y.Year) : x.Id.CompareTo(y.Id));
Console.WriteLine($"со вторым ключом: {Stable(sortedList)}");

record B(int Id, int Year);
~~~
~~~console
OrderBy сохранил порядок равных: True
List.Sort — гарантия отсутствует; порядок сохранён случайно: False
со вторым ключом: True
~~~

Вывод для практики: если порядок равных важен — используй `OrderBy().ThenBy()` либо добавляй в компаратор второй ключ. Полагаться на «случайно устойчивую» работу `List.Sort` нельзя: результат зависит от размера данных и версии .NET.

### Шаг 4. Рекурсия

Рекурсивная функция вызывает саму себя на **меньшей** задаче. Обязательны:

1. **Базовый случай** — когда остановиться.
2. **Шаг**, который гарантированно приближает к базовому случаю.

~~~csharp
Console.WriteLine(SumDigits(98_765));
Console.WriteLine(CountFiles(new Folder("root", new() { new("a", new()), new("b", new() { new("c", new()) }) }, 2)));
Console.WriteLine(Factorial(10));
Console.WriteLine(Power(2, 30));

static int SumDigits(int n) => n < 10 ? n : n % 10 + SumDigits(n / 10);

// Рекурсия естественна для деревьев: папки, категории, комментарии с ответами
static int CountFiles(Folder f)
{
    int total = f.Files;
    foreach (var child in f.Children) total += CountFiles(child);
    return total;
}

static long Factorial(int n) => n <= 1 ? 1 : n * Factorial(n - 1);

// возведение в степень за O(log n): половиним показатель
static long Power(long x, int n)
{
    if (n == 0) return 1;
    long half = Power(x, n / 2);
    return n % 2 == 0 ? half * half : half * half * x;
}

record Folder(string Name, List<Folder> Children, int Files = 1);
~~~
~~~console
35
5
3628800
1073741824
~~~

Каждый вызов занимает кадр стека. Слишком глубокая рекурсия (сотни тысяч уровней) приводит к `StackOverflowException`, который **нельзя поймать** — процесс просто завершится. Для глубоких структур используют цикл с явным `Stack<T>`.

~~~csharp Та же задача без рекурсии
var tree = new Folder("root", new() { new("a", new()), new("b", new() { new("c", new()) }) }, 2);
Console.WriteLine(CountFilesIterative(tree));

static int CountFilesIterative(Folder root)
{
    int total = 0;
    var stack = new Stack<Folder>();
    stack.Push(root);
    while (stack.Count > 0)
    {
        var f = stack.Pop();
        total += f.Files;
        foreach (var child in f.Children) stack.Push(child);
    }
    return total;
}

record Folder(string Name, List<Folder> Children, int Files = 1);
~~~
~~~console
5
~~~

Как проверить безопасную глубину рекурсии, не уронив процесс — `RuntimeHelpers.EnsureSufficientExecutionStack()` бросает *перехватываемое* исключение, когда стек почти кончился:

~~~csharp
using System.Runtime.CompilerServices;

int depth = 0;
try { Dive(); }
catch (InsufficientExecutionStackException) { Console.WriteLine($"глубина больше 1000: {depth > 1000}"); }

void Dive()
{
    RuntimeHelpers.EnsureSufficientExecutionStack();
    depth++;
    Dive();
}
~~~
~~~console
глубина больше 1000: True
~~~

### Шаг 5. Запоминание результатов (мемоизация)

Наивная рекурсия иногда считает одно и то же снова и снова. Классика — числа Фибоначчи и «лесенка» (сколькими способами подняться на n ступенек шагами по 1 или 2; задача LeetCode «Climbing Stairs»):

~~~csharp
int calls = 0;
long Slow(int n) { calls++; return n <= 1 ? n : Slow(n - 1) + Slow(n - 2); }
Console.WriteLine($"Slow(25) = {Slow(25)}, вызовов: {calls:N0}");

var memo = new Dictionary<int, long>();
int calls2 = 0;
long Fast(int n)
{
    calls2++;
    if (n <= 1) return n;
    if (memo.TryGetValue(n, out var cached)) return cached;
    return memo[n] = Fast(n - 1) + Fast(n - 2);
}
Console.WriteLine($"Fast(25) = {Fast(25)}, вызовов: {calls2}");

// «лесенка» циклом: способов подняться на n ступенек = способов(n-1) + способов(n-2)
static long Stairs(int n)
{
    long prev = 1, cur = 1;                    // 0 и 1 ступенька — по одному способу
    for (int i = 2; i <= n; i++) (prev, cur) = (cur, prev + cur);
    return cur;
}
Console.WriteLine($"{Stairs(2)} {Stairs(3)} {Stairs(10)}");
~~~
~~~console
Slow(25) = 75025, вызовов: 242,785
Fast(25) = 75025, вызовов: 49
2 3 89
~~~

Наивный вариант — O(2ⁿ), с запоминанием — O(n). Это самая простая форма *динамического программирования*: разбить задачу на подзадачи и не решать одну и ту же дважды.

### Шаг 6. Приём «два указателя»

Для отсортированного массива задачу «найти пару с заданной суммой» можно решить за один проход с двух концов:

~~~csharp
int[] a = { 1, 3, 4, 6, 8, 11 };
Console.WriteLine(FindPair(a, 10) is var p && p is not null ? $"{p.Value.i},{p.Value.j}" : "нет");
Console.WriteLine(FindPair(a, 100) is null);

static (int i, int j)? FindPair(int[] sorted, int target)
{
    int i = 0, j = sorted.Length - 1;
    while (i < j)
    {
        int s = sorted[i] + sorted[j];
        if (s == target) return (i, j);
        if (s < target) i++; else j--;
    }
    return null;
}
~~~
~~~console
2,3
True
~~~

O(n) времени и O(1) памяти — выигрыш перед словарём в памяти, но только при отсортированном входе.

## Как это работает под капотом

- **Стек вызовов.** Каждый вызов метода кладёт на стек потока **кадр**: аргументы, локальные переменные, адрес возврата. Рекурсия глубины n занимает O(n) памяти стека. Размер стека главного потока по умолчанию — порядка 1 МБ (Windows) – 8 МБ (Linux); при исчерпании процесс завершается без возможности перехвата. Явный `Stack<T>` живёт в куче и ограничен только памятью.
- **Хвостовая рекурсия не оптимизируется.** В некоторых языках компилятор превращает «последний вызов» в цикл. В C# так не гарантируется: надёжный способ избежать глубины — написать цикл.
- **Introsort в .NET.** `Array.Sort`/`List<T>.Sort` начинают как quicksort с выбором опоры «медиана из трёх», при превышении глубины ~2·log₂ n переходят на heapsort, а куски меньше 16 элементов доделывают вставками. Поэтому на очень коротких коллекциях результат «случайно» стабилен, а на больших — нет (отсюда ловушка из шага 3).
- **LINQ `OrderBy`.** Вычисляет ключи один раз, сортирует массив индексов с компаратором, который при равенстве ключей сравнивает *исходные позиции* — так достигается устойчивость. Цена — дополнительная память O(n).
- **`Array.BinarySearch`.** Возвращает индекс при совпадении, иначе — побитовое дополнение `~` индекса элемента, который следует за искомым значением; удобно для вставки в нужное место.
- **Сложность мемоизации.** Словарь превращает экспоненциальное дерево вызовов в линейное, обменивая память на время — тот же компромисс, что и с `HashSet` в [Big O](#p2-bigo).
- **Компаратор должен быть согласованным.** Сортировка предполагает: `Compare(a,b) = -Compare(b,a)`, транзитивность, `Compare(a,a) = 0`. Нарушение даёт неопределённый порядок, а иногда `InvalidOperationException` (IComparer.Compare() method returns inconsistent results).

Справочник: [сложность коллекций](#/ref/e/co-complexity), [стек и куча](#/ref/g/rt-stack-heap).

## Типичные ошибки и ловушки

- **Бинарный поиск на неотсортированных данных.** Ответ мусорный, ошибки нет.
- **Переполнение `lo + hi`.** Используй `lo + (hi - lo) / 2`.
- **Бесконечный цикл в бинарном поиске.** Забыли `mid + 1` / `mid - 1` — границы не сдвигаются.
- **Путаница форм.** Смешали `lo <= hi, hi = n - 1` и `lo < hi, hi = n` — получили off-by-one на краях.
- **Рекурсия без базового случая или без приближения к нему.** `StackOverflowException`, процесс падает.
- **Наивная рекурсия с повторяющимися подзадачами.** `Fib(40)` наивно — сотни миллионов вызовов; нужна мемоизация или цикл.
- **Опора на устойчивость `List.Sort`.** Её нет; добавляй второй ключ или `OrderBy/ThenBy`.
- **Несогласованный компаратор.** `(a, b) => a.X > b.X ? 1 : -1` не возвращает 0 при равенстве → некорректная сортировка. Используй `CompareTo`.
- **Вычитание в компараторе.** `a - b` для `int` может переполниться; используй `a.CompareTo(b)`.
- **Сортировка ради максимума.** `OrderBy().First()` — O(n log n); `Max/MaxBy` — O(n).
- **Рекурсия там, где глубина непредсказуема.** Обход пользовательских структур (вложенные комментарии, граф) — через явный стек/очередь.
- **Мутация массива во время рекурсивного разбиения срезами.** `a[..mid]` создаёт копию (O(n) на каждом уровне); для больших данных передавай индексы или `Span<T>`.

## Вопросы с собеседований

:::spoiler Почему бинарный поиск — O(log n)?
Каждая итерация вдвое уменьшает диапазон поиска. Число делений n пополам до 1 — log₂ n.
:::

:::spoiler Почему quicksort в худшем случае O(n²)?
Если опорный элемент каждый раз оказывается минимальным или максимальным (например, неудачный выбор на уже отсортированных данных), разбиение даёт части размера n−1 и 0, глубина рекурсии — n, каждый уровень — O(n).
:::

:::spoiler Что такое стабильная сортировка и стабилен ли `List<T>.Sort`?
Стабильная сохраняет относительный порядок равных элементов. `List<T>.Sort`/`Array.Sort` — нестабильные (introsort). `OrderBy` в LINQ — стабильный.
:::

:::spoiler Зачем `mid = lo + (hi - lo) / 2`?
`lo + hi` может переполнить `int` на очень больших массивах. Вычитание сначала держит значение в допустимом диапазоне.
:::

:::spoiler Что вернёт `Array.BinarySearch`, если элемента нет? (ловушка: «-1»)
Не `-1`, а отрицательное число — побитовое дополнение индекса, куда элемент нужно вставить. `~result` даёт позицию вставки, сохраняющую порядок.
:::

:::spoiler Чем рекурсия отличается от цикла? Когда она опасна?
Рекурсия использует стек вызовов (O(глубина) памяти), цикл — нет. Слишком глубокая рекурсия вызывает `StackOverflowException`, который нельзя перехватить. На глубоких/непредсказуемых структурах переходят на цикл с явным `Stack<T>`.
:::

:::spoiler Как ускорить рекурсивные числа Фибоначчи?
Запоминать вычисленные значения (мемоизация, словарь) или считать циклом с двумя переменными: с O(2ⁿ) до O(n).
:::

:::spoiler Какая сортировка в `Array.Sort` и какая у неё сложность?
Introsort: quicksort с переключением на heapsort при большой глубине и на вставки для коротких кусков. O(n log n) в худшем случае, нестабильная.
:::

:::spoiler Как найти пару с суммой target в отсортированном массиве за O(n) без доп. памяти?
Два указателя с концов: сумма меньше — двигаем левый вправо, больше — правый влево, пока не совпадёт или не сойдутся.
:::

## Что запомнить

- Бинарный поиск — O(log n), только на отсортированных данных; `mid = lo + (hi - lo) / 2`; главная опасность — границы.
- `Array.BinarySearch` при отсутствии возвращает `~позиция вставки`.
- Merge sort: O(n log n) всегда, стабилен, O(n) памяти; quicksort: в среднем O(n log n), в худшем O(n²), на месте.
- `Array.Sort`/`List.Sort` — introsort, не стабильны; `OrderBy` — стабилен. Нужен порядок равных — `ThenBy` или второй ключ.
- Рекурсия = базовый случай + шаг к нему; цена — стек (`StackOverflowException` не ловится); глубокие структуры — цикл со `Stack<T>`.
- Повторяющиеся подзадачи → мемоизация: обмениваем память на время.
- Два указателя: O(n) и O(1) памяти на отсортированных данных.
- Компаратор: `CompareTo`, а не вычитание; согласованный и транзитивный.

## Практика

- [ ] Написал бинарный поиск и проверил на 7 граничных случаях
- [ ] Написал merge sort и сравнил время с `Array.Sort` на 1 000 000 случайных чисел
- [ ] Показал нестабильность `List.Sort` и стабильность `OrderBy` на книгах с одинаковым годом
- [ ] Решил рекурсией: факториал, степень за O(log n), обход дерева папок; одну из них переписал на цикл со `Stack<T>`
- [ ] LeetCode: «Binary Search», «First Bad Version», «Search Insert Position», «Climbing Stairs»

@@page id="p2-solid" phase="2" kind="topic" title="SOLID как ориентир, а не догма" nav="SOLID" est="3–4 дня"
:::why
Про SOLID спрашивают почти на каждом собеседовании, а в Фазе 4 эти идеи станут архитектурой твоего API. Сейчас задача скромнее: узнавать нарушения в своём коде и понимать, **какую боль** каждый принцип снимает. Не превращай SOLID в повод для пяти интерфейсов на один класс.
:::

## Зачем это нужно

Любой код со временем меняется: добавляются новые типы читателей, новые способы хранения, новые правила штрафов. Вопрос в том, **сколько мест придётся править** ради одного изменения и **насколько страшно** это делать. Если ради нового типа читателя нужно открывать пять файлов и править `switch` в каждом, а после правки приходится вручную перепроверять всё приложение — дизайн «болит».

SOLID — пять эвристик, накопленных опытом, которые уменьшают эту боль:

- **S**ingle Responsibility — у класса одна причина для изменения;
- **O**pen/Closed — новые варианты добавляются новым кодом, а не правкой старого;
- **L**iskov Substitution — наследник можно подставить вместо базы без сюрпризов;
- **I**nterface Segregation — клиент зависит только от того, что использует;
- **D**ependency Inversion — высокоуровневая логика зависит от абстракций, а не от деталей.

Зачем это именно тебе:

- **Собеседование.** «Расскажи про SOLID» — один из самых частых вопросов. Ответ «S — единственная ответственность» без примера звучит заученно; ответ «вот боль, вот решение, вот когда не нужно» — уровень Junior+.
- **ASP.NET Core и EF Core.** Контроллеры получают зависимости через конструктор, сервисы описаны интерфейсами, регистрация идёт в DI-контейнере. Всё это — Dependency Inversion на практике.
- **Тестируемость.** Код, который сам создаёт `new JsonLoanStore()` и читает `DateTime.Now`, невозможно проверить автотестом. Принципы D и I именно про это.
- **Чтение чужого кода.** Видя `IFineRule` с тремя реализациями, ты сразу понимаешь замысел автора.

И главная оговорка: SOLID — *ориентир, а не догма*. Слепое следование рождает «интерфейс на каждый класс» и десятки крошечных файлов без пользы. Эта страница учит не только применять принципы, но и **узнавать, когда они не нужны**.

## Интуиция и аналогия

**Розетки и вилки (D + I).** Бытовой прибор не припаивается к проводке дома — у него вилка, а в стене розетка. Прибор зависит от *стандарта розетки* (абстракции), а не от конкретной электростанции. Хочешь поменять поставщика электричества — прибор не трогаешь. И розетка бывает разная: для чайника — мощная, для зарядки — слабая; не нужен один «жирный» разъём на всё (I).

**Конструктор LEGO (O).** Набор расширяется новыми деталями, а старые не пилят. Добавил колесо — не переплавляя кубики.

**Универсальный пульт (L).** Если у телевизора есть кнопка «громкость +», любая модель обязана её поддерживать. Модель без звука с кнопкой, которая взрывается, — нарушение обещания базового контракта.

**Повар и официант (S).** Повар готовит, официант подаёт, кассир считает. Если один человек делает всё, любое изменение (меню, формат чека, способ оплаты) касается его одного, и он становится узким местом.

## Основная теория по шагам

### Шаг 1. S — Single Responsibility: одна причина для изменения

Класс должен меняться по **одной причине**. Не «делать одну вещь» в буквальном смысле, а отвечать перед одним «заказчиком изменений».

~~~csharp
var loans = new[] { new Loan(1, 10, new DateOnly(2026, 1, 1), null), new Loan(2, 11, new DateOnly(2026, 1, 20), new DateOnly(2026, 1, 15)) };

var policy = new FinePolicy();
var report = new LoanReportBuilder(policy).Build(loans, today: new DateOnly(2026, 1, 11));
Console.WriteLine(report);

// ❌ Класс меняется, если поменяется формат отчёта, правила штрафа И способ хранения
class LoanManager
{
    public decimal CalculateFine(Loan l) => 0m;                         // правила
    public string BuildReport(IEnumerable<Loan> loans) => "";            // форматирование
    public void SaveToJson(IEnumerable<Loan> loans) { }                  // файл
}

// ✅ Каждый класс отвечает за одну вещь
class FinePolicy
{
    public decimal Calculate(Loan l, DateOnly today) =>
        l.Returned is null && l.Due < today ? (today.DayNumber - l.Due.DayNumber) * 5m : 0m;
}

class LoanReportBuilder(FinePolicy policy)
{
    public string Build(IEnumerable<Loan> loans, DateOnly today) =>
        string.Join("\n", loans.Select(l => $"книга {l.BookId}: штраф {policy.Calculate(l, today)}"));
}

record Loan(int BookId, int ReaderId, DateOnly Due, DateOnly? Returned);
~~~
~~~console
книга 1: штраф 50
книга 2: штраф 0
~~~

Признаки нарушения: в классе методы про несвязанные вещи (расчёт, отчёт, файлы, сеть), слова «And»/«Manager»/«Helper» в названии, тест класса требует настроить пять разных вещей, правка в одном месте задевает несвязанное.

### Шаг 2. O — Open/Closed: расширяй, не переписывая

Код должен быть **открыт для расширения и закрыт для изменения**: новое поведение добавляется новым кодом.

~~~csharp
// ❌ Новый тип читателя = правка switch во всех местах
static decimal FineBad(string readerType, int daysLate) => readerType switch
{
    "student" => daysLate * 5m,
    "teacher" => 0m,
    _ => daysLate * 10m
};
Console.WriteLine($"{FineBad("student", 3)} {FineBad("teacher", 3)} {FineBad("guest", 3)}");

// ✅ Новый тип = новый класс; существующий код не меняется
IFineRule[] rules = { new StudentRule(), new TeacherRule(), new DefaultRule(), new PensionerRule() };
foreach (var r in rules) Console.WriteLine($"{r.GetType().Name}: {r.Fine(3)}");

interface IFineRule { decimal Fine(int daysLate); }
sealed class StudentRule : IFineRule { public decimal Fine(int d) => d * 5m; }
sealed class TeacherRule : IFineRule { public decimal Fine(int d) => 0m; }
sealed class DefaultRule : IFineRule { public decimal Fine(int d) => d * 10m; }
sealed class PensionerRule : IFineRule { public decimal Fine(int d) => d * 2m; }   // добавили — ничего не правили
~~~
~~~console
15 0 30
StudentRule: 15
TeacherRule: 0
DefaultRule: 30
PensionerRule: 6
~~~

Ты уже делал это в Фазе 1, когда добавлял `DepositAccount`, не трогая цикл по счетам: полиморфизм — главный инструмент O.

Но не любой `switch` — зло. Если вариантов три и они фиксированы (дни недели, статусы заказа), `switch` проще и читабельнее иерархии. Применяй O, когда **варианты растут** и вынуждают править один и тот же `switch` в нескольких местах.

### Шаг 3. L — Liskov Substitution: наследник не ломает обещания базы

Везде, где ждут базовый тип, можно подставить наследника — и поведение останется корректным. Наследник не должен усиливать требования к входам, ослаблять гарантии выходов и бросать неожиданные исключения.

Классический пример — квадрат и прямоугольник:

~~~csharp
Console.WriteLine(Area(new Rectangle { Width = 4, Height = 5 }));    // 20 — как ждём
Console.WriteLine(Area(new Square { Width = 4, Height = 5 }));        // Square «подправил» вторую сторону → не 20!

// Код, рассчитанный на Rectangle: «задал ширину 4, высоту 5 → площадь 20»
static int Area(Rectangle r) { r.Width = 4; r.Height = 5; return r.Width * r.Height; }

class Rectangle
{
    public virtual int Width { get; set; }
    public virtual int Height { get; set; }
}

class Square : Rectangle
{
    public override int Width { get => base.Width; set { base.Width = value; base.Height = value; } }
    public override int Height { get => base.Height; set { base.Width = value; base.Height = value; } }
}
~~~
~~~console
20
25
~~~

Математически квадрат — прямоугольник, но **поведенчески** (с изменяемыми сторонами) — нет. Решение: не наследовать, а использовать общий интерфейс `IShape` с `Area()` и неизменяемые фигуры.

Второй классический пример — «только-для-чтения» вариант изменяемого контракта:

~~~csharp
ICatalog catalog = new ReadOnlyCatalog();
try { catalog.Add("Идиот"); }                        // код, рассчитанный на ICatalog, ломается
catch (NotSupportedException) { Console.WriteLine("NotSupportedException — нарушение LSP"); }

// ✅ Честнее: разные контракты для чтения и изменения
IReadOnlyCatalog honest = new ReadOnlyCatalog();
Console.WriteLine(honest.Count);

interface IReadOnlyCatalog { int Count { get; } }
interface ICatalog : IReadOnlyCatalog { void Add(string title); }

class ReadOnlyCatalog : ICatalog
{
    public int Count => 0;
    public void Add(string title) => throw new NotSupportedException();   // обещали Add, а не умеем
}
~~~
~~~console
NotSupportedException — нарушение LSP
0
~~~

Исправление: `ReadOnlyCatalog` должен реализовывать только `IReadOnlyCatalog`. В BCL это `IReadOnlyList<T>` для чтения и `IList<T>` для изменения.

Признаки нарушения: `NotSupportedException`/`NotImplementedException` в переопределениях, проверки `if (x is Наследник)` в коде, работающем с базой, пустые «заглушки» вместо реализации.

### Шаг 4. I — Interface Segregation: маленькие интерфейсы под клиентов

Клиент не должен зависеть от методов, которыми не пользуется. «Жирный» интерфейс заставляет реализации делать ненужное и тянет лишние зависимости в тесты.

~~~csharp
IAccountStore store = new InMemoryStore();
Console.WriteLine(new BalanceReport().Describe(store, 1));      // отчёту нужно только читать
new Importer().Import(store);                                    // импортёру — только писать
Console.WriteLine(new BalanceReport().Describe(store, 1));

// ❌ Один «жирный» IAccountRepository заставил бы отчёт зависеть от Save/Delete
// ✅ Узкие интерфейсы
interface IAccountReader { decimal GetBalance(int id); }
interface IAccountWriter { void SetBalance(int id, decimal value); }
interface IAccountStore : IAccountReader, IAccountWriter { }       // составной — для тех, кому нужны оба

class InMemoryStore : IAccountStore
{
    private readonly Dictionary<int, decimal> _data = new() { [1] = 100m };
    public decimal GetBalance(int id) => _data.GetValueOrDefault(id);
    public void SetBalance(int id, decimal value) => _data[id] = value;
}

class BalanceReport { public string Describe(IAccountReader r, int id) => $"баланс #{id}: {r.GetBalance(id)}"; }
class Importer { public void Import(IAccountWriter w) => w.SetBalance(1, 250m); }
~~~
~~~console
баланс #1: 100
баланс #1: 250
~~~

Ты видел это в Фазе 1: `IAccountReader` и `IAccountWriter` вместо одного «жирного» `IAccountRepository`. Отчёту нужно только читать — пусть он и зависит только от чтения. Побочный бонус: при тестировании отчёта подделывается один метод, а не десять.

### Шаг 5. D — Dependency Inversion: завись от абстракций

Высокоуровневая логика не должна зависеть от низкоуровневых деталей (файл, время, БД, HTTP): обе стороны зависят от абстракции, и конкретная реализация **передаётся снаружи**.

~~~csharp
// ✅ Зависимости приходят снаружи (плохой вариант LoanServiceBad — в конце блока) как абстракции — и сервис проверяется без файлов и без «сегодня»
var store = new FakeStore(new[]
{
    new Loan(1, 1, new DateOnly(2026, 1, 5), null),
    new Loan(2, 1, new DateOnly(2026, 1, 20), null),
    new Loan(3, 1, new DateOnly(2026, 1, 1), new DateOnly(2026, 1, 3)),
});
var clock = new FixedClock(new DateOnly(2026, 1, 10));

var service = new LoanService(store, clock);
Console.WriteLine(string.Join(",", service.Overdue().Select(l => l.BookId)));

clock.Today = new DateOnly(2026, 2, 1);                // «перемотали» время — тест без ожидания
Console.WriteLine(string.Join(",", service.Overdue().Select(l => l.BookId)));

interface ILoanStore { IReadOnlyList<Loan> All(); }
interface IClock { DateOnly Today { get; } }

sealed class LoanService
{
    private readonly ILoanStore _store;
    private readonly IClock _clock;
    public LoanService(ILoanStore store, IClock clock) { _store = store; _clock = clock; }

    public IEnumerable<Loan> Overdue() =>
        _store.All().Where(l => l.Returned is null && l.Due < _clock.Today);
}

sealed class FakeStore(IReadOnlyList<Loan> loans) : ILoanStore { public IReadOnlyList<Loan> All() => loans; }
sealed class FixedClock(DateOnly today) : IClock { public DateOnly Today { get; set; } = today; }

// ❌ Плохой вариант: сервис сам создаёт свои зависимости — нельзя подменить хранилище или время
class LoanServiceBad
{
    private readonly JsonLoanStore _store = new();
    public bool IsOverdue(Loan l) => DateOnly.FromDateTime(DateTime.Now) > l.Due;
}
class JsonLoanStore { }

record Loan(int BookId, int ReaderId, DateOnly Due, DateOnly? Returned);
~~~
~~~console
1
1,2
~~~

Это основа Dependency Injection в ASP.NET Core (Фаза 4): контейнер сам передаёт в конструктор нужные реализации. Различай: **DIP** — принцип («зависимость от абстракций»), **DI** — приём («зависимости передаются снаружи»), **IoC-контейнер** — инструмент, который собирает граф объектов за тебя.

### Шаг 6. Когда SOLID вредит

:::warn Когда SOLID вредит
- Интерфейс для класса, у которого никогда не будет второй реализации и который не нужно подменять в тестах.
- Разбиение 30-строчного класса на шесть классов «ради S».
- Абстракции «на будущее», которое не наступает.

Ориентир: принцип применяется, когда он **снимает реальную боль** — изменения расползаются, тестировать невозможно, новый вариант требует правок в пяти местах.
:::

Хороший эвристический вопрос: «Что именно я смогу сделать после этого рефакторинга, чего не мог раньше?» Если ответ — «ничего, просто красивее» — оставь как есть. Правило трёх: первый раз пиши прямо, второй раз — терпи копипасту, на третий выделяй абстракцию.

Также запомни спутников SOLID: **DRY** (не повторяйся — но случайное сходство кода не повод для общей абстракции), **KISS** (проще — лучше), **YAGNI** (не делай того, что не нужно сейчас).

## Как это работает под капотом

- **Принципы — не код компилятора, а договорённости.** Компилятор не проверит, нарушил ли ты LSP; проверяют тесты и код-ревью. Зато он помогает косвенно: `sealed`, `readonly`, интерфейсы, `init`-свойства.
- **DI-контейнер ASP.NET Core** — это словарь «тип абстракции → способ создания реализации». При создании контроллера он рефлексией смотрит параметры конструктора, рекурсивно создаёт нужные зависимости и подставляет их. Время жизни: `Singleton` (один на приложение), `Scoped` (один на запрос), `Transient` (новый каждый раз).
- **Интерфейс и виртуальный вызов.** Вызов через интерфейс — это косвенный вызов через таблицу методов; он чуть дороже прямого, но для бизнес-кода разница несущественна. Для `sealed` классов и структур JIT может вызывать напрямую.
- **`IClock` в .NET.** В современном .NET уже есть стандартная абстракция времени — `TimeProvider` (и `FakeTimeProvider` для тестов): тот самый `IClock`, только готовый.
- **Полиморфизм вместо `switch`.** Таблица виртуальных методов позволяет выбрать реализацию в рантайме без `if`/`switch`; ценой становится больше типов и необходимость регистрировать их в одном месте (фабрика, DI).
- **Инверсия зависимостей меняет направление ссылок между проектами.** Интерфейс `ILoanStore` живёт в слое бизнес-логики, а реализация (`EfLoanStore`) — в слое инфраструктуры; логика не ссылается на EF Core. Этот приём ляжет в основу слоистой архитектуры в Фазе 4.
- **Liskov и сигнатуры.** Язык частично помогает: переопределение не может сузить тип параметра, а ковариантность возвращаемых типов разрешена — это формальные следы принципа подстановки.

Справочник: [абстрактный класс или интерфейс](#/ref/c/cl-abstract-vs-interface), [инкапсуляция](#p1-encapsulation), [наследование](#p1-inheritance), [интерфейсы](#p1-interfaces).

## Типичные ошибки и ловушки

- **Интерфейс на каждый класс.** `IUserService` с единственной реализацией и без подмены — шум. Вводи абстракцию, когда есть вторая реализация или потребность в тестовой подмене.
- **«God class».** Один `Manager`/`Helper`/`Utils` на тысячу строк — нарушение S; признаки: десяток зависимостей в конструкторе.
- **Наследование ради повторного использования.** Если «наследник» нарушает поведение базы — это не наследование; используй композицию.
- **`NotImplementedException` в реализации интерфейса.** Сигнал нарушения L или I: интерфейс слишком жирный.
- **Статические зависимости.** `DateTime.Now`, `File.ReadAllText`, `new HttpClient()` внутри бизнес-логики делают её нетестируемой; вынеси за абстракцию.
- **Service Locator вместо DI.** Получать зависимости из глобального контейнера внутри метода — скрытые зависимости, которых не видно в конструкторе.
- **Сверхгибкость.** Конфигурируемые стратегии для вещей, которые не меняются; код читается хуже, чем «в лоб».
- **Заучивание названий без примеров.** Назвать пять букв просто, показать боль и решение на своём коде — настоящее знание.
- **Смешение DIP и DI.** Передавать конкретный класс в конструктор — это DI, но не DIP; DIP требует абстракции.
- **Нарушение S из-за «удобства».** Метод `Save()` в доменной модели «чтобы было удобно» тянет зависимость от БД в домен.

## Вопросы с собеседований

:::spoiler Назови все пять принципов SOLID и боль, которую снимает каждый
S — класс меняется по разным причинам, правки ломают несвязанное. O — новый вариант требует правок существующего кода. L — наследник ломает код, рассчитанный на базу. I — клиенты зависят от методов, которыми не пользуются. D — высокоуровневая логика жёстко привязана к деталям (файл, время, БД) и не тестируется.
:::

:::spoiler Как связаны DIP и Dependency Injection?
DIP — принцип: зависеть от абстракций. DI — техника: передавать зависимости снаружи (обычно через конструктор), часто с помощью контейнера. DI — самый распространённый способ следовать DIP.
:::

:::spoiler Приведи пример нарушения Liskov. (ловушка: «квадрат — это прямоугольник»)
Класс `Square`, унаследованный от `Rectangle`: установка ширины меняет высоту, и код, рассчитанный на прямоугольник («ширина 4, высота 5 → площадь 20»), даёт неверный результат. Либо коллекция «только для чтения», унаследованная от изменяемой, с `NotSupportedException` в `Add`.
:::

:::spoiler Как Open/Closed связан с полиморфизмом?
Вместо `switch` по типу вводится абстракция с реализациями; новый вариант — новый класс. Существующий код работает с абстракцией и не меняется.
:::

:::spoiler Когда применять SOLID не стоит?
Когда принцип не снимает реальную боль: интерфейс без второй реализации, дробление простого класса, абстракции «на будущее». Правило трёх и YAGNI помогают не переусложнять.
:::

:::spoiler Зачем в тестируемом коде вводить `IClock`/`TimeProvider`?
Чтобы контролировать «текущее время» в тестах: код не вызывает `DateTime.Now` напрямую, и тест подставляет фиксированную дату, проверяя просрочку без ожидания.
:::

:::spoiler Чем Interface Segregation отличается от Single Responsibility?
S — про причины изменения класса (внутренняя связность), I — про то, какой интерфейс видит клиент (минимальный контракт). Один класс может реализовать несколько узких интерфейсов и при этом соблюдать S.
:::

:::spoiler Что такое IoC-контейнер и в чём его польза?
Это инструмент, который по регистрациям «абстракция → реализация» сам создаёт объекты и подставляет зависимости в конструкторы. Польза: нет ручной сборки графа объектов, управляемое время жизни, лёгкая подмена в тестах.
:::

## Что запомнить

- S: одна причина для изменения; O: новое поведение — новым кодом (полиморфизм вместо растущего `switch`); L: наследник не ломает ожидания базы; I: маленькие интерфейсы под клиента; D: зависим от абстракций, зависимости приходят снаружи.
- Признаки: S — «Manager/Helper» на тысячу строк; L — `NotSupportedException` и `is`-проверки; D — `new` и `DateTime.Now` внутри логики.
- DIP — принцип, DI — приём, IoC-контейнер — инструмент.
- `IReadOnlyList<T>` честнее «списка, который нельзя менять».
- Применяй принцип, когда он снимает реальную боль; интерфейс без второй реализации и без тестовой подмены — шум.
- Правило трёх, DRY, KISS, YAGNI — спутники, удерживающие SOLID от крайностей.
- Время — тоже зависимость: `IClock` / `TimeProvider`.

## Практика

- [ ] Нашёл в банковском проекте Фазы 1 по одному примеру соблюдения и нарушения каждого принципа
- [ ] Переписал расчёт штрафа в проекте библиотеки на `IFineRule`
- [ ] Ввёл `IClock` в `LoanService` и проверил просрочку с фиксированной датой
- [ ] Записал голосовую заметку: SOLID за 2 минуты с примерами из своего кода

