@@append id="p2-iterators"
## Закрепление {#lab}

:::quiz Итераторы и отложенное выполнение
? Что выведет код? #net
| var nums = new List<int> { 1, 2, 3 };
| var q = nums.Where(x => x > 1);
| nums.Add(10);
| Console.WriteLine(q.Count());
- 2
+ 3
- 1
- 4
= LINQ-запрос не выполняется при объявлении — только при переборе. К моменту `Count()` в списке 1, 2, 3, 10 → подходят 2, 3, 10.

? Сколько раз выполнится тело метода-итератора, если перебрать результат дважды? #net
| IEnumerable<int> Gen() { Console.WriteLine("старт"); yield return 1; }
| var g = Gen();
| foreach (var x in g) { }
| foreach (var x in g) { }
- Один раз
+ Дважды — «старт» напечатается два раза
- Ни разу
- Ошибка при втором переборе
= `yield`-метод — это не коллекция, а «рецепт». Каждый `foreach` создаёт новый перечислитель и запускает тело заново. Нужен кэш — `ToList()`.

? Что на самом деле делает `yield return`? #net
- Возвращает значение и завершает метод
+ Компилятор строит конечный автомат: метод «приостанавливается» между элементами и продолжается при следующем MoveNext
- Запускает метод в другом потоке
- Копирует всю коллекцию в память
= Итератор даёт ленивую последовательность — удобно для бесконечных потоков и экономии памяти.

? Какое преимущество у ленивого `IEnumerable` перед `List`? #bigo
+ Не нужно хранить все элементы в памяти; можно остановиться раньше (First/Take)
- Всегда быстрее
- Поддерживает индексацию
- Потокобезопасен
= Ленивость экономит память и время, если потребитель берёт не всё. Платим тем, что повторный перебор повторяет работу.
:::

:::ide Бесконечный генератор Фибоначчи
@xp 55
@task
Реализуй `Solver.Fibonacci()` — **бесконечную** ленивую последовательность `0, 1, 1, 2, 3, 5, …` типа `IEnumerable<long>`. Используй `yield return`: никаких списков и массивов.
@code
~~~csharp
using System;
using System.Collections.Generic;
using System.Linq;

public static class Solver
{
    public static IEnumerable<long> Fibonacci()
    {
        // TODO
        yield break;
    }
}
~~~
@tests
~~~csharp
class T
{
    public static void Run()
    {
        Assert.Equal(new List<long> { 0, 1, 1, 2, 3, 5, 8, 13, 21, 34 }, Solver.Fibonacci().Take(10).ToList(), "первые 10");
        Assert.Equal(12586269025L, Solver.Fibonacci().Skip(50).First(), "50-е число");
        Assert.Equal(3, Solver.Fibonacci().Where(x => x > 1).Take(3).Count(), "бесконечность не мешает Take");
    }
}
~~~
@require yield\s+return => Условие: ленивая последовательность через yield return
@forbid new\s+(List|long\[\]|int\[\]) => Без списков и массивов
@hint
Хватит двух переменных `a = 0, b = 1`. В бесконечном `while (true)` отдаёшь `a` и сдвигаешь пару: `(a, b) = (b, a + b)`.
@solution
~~~csharp
using System;
using System.Collections.Generic;
using System.Linq;

public static class Solver
{
    public static IEnumerable<long> Fibonacci()
    {
        long a = 0, b = 1;
        while (true)
        {
            yield return a;
            (a, b) = (b, a + b);
        }
    }
}
~~~
@why
Бесконечный цикл здесь безопасен: метод выполняется **кусочками** — ровно до следующего `yield return`, пока потребитель просит элементы. `Take(10)` остановит перебор.
:::

:::ticket Источник данных вызывается трижды
@key DATA-23
@type Bug
@prio High
@reporter Рома (бэкенд)
@labels LINQ, отложенное выполнение
@xp 75
@task
`Describe()` строит сводку по данным из дорогого источника `Source.Load()` (запрос во внешний сервис). В логах видим **три** обращения вместо одного: каждая операция над `IEnumerable` заново запускает источник.

**Ожидается:** результат тот же, но `Source.Load()` вызывается ровно **один** раз за `Describe()`.
@comment Рома: Сервис тарифицируется за каждый запрос. Нас уже ругала бухгалтерия.
@code
~~~csharp
using System;
using System.Collections.Generic;
using System.Linq;

public static class Source
{
    public static int Calls;
    public static IEnumerable<int> Load()
    {
        Calls++;
        yield return 1;
        yield return 2;
        yield return 3;
    }
}

public static class Solver
{
    public static string Describe()
    {
        var items = Source.Load();
        if (!items.Any()) return "пусто";
        return "всего " + items.Count() + ", сумма " + items.Sum();
    }
}
~~~
@tests
~~~csharp
class T
{
    public static void Run()
    {
        Source.Calls = 0;
        Assert.Equal("всего 3, сумма 6", Solver.Describe(), "результат");
        Assert.Equal(1, Source.Calls, "источник вызван один раз");
    }
}
~~~
@hint
Материализуй последовательность один раз: `var items = Source.Load().ToList();` — дальше работай со списком.
@solution
~~~csharp
using System;
using System.Collections.Generic;
using System.Linq;

public static class Source
{
    public static int Calls;
    public static IEnumerable<int> Load()
    {
        Calls++;
        yield return 1;
        yield return 2;
        yield return 3;
    }
}

public static class Solver
{
    public static string Describe()
    {
        var items = Source.Load().ToList();
        if (items.Count == 0) return "пусто";
        return "всего " + items.Count + ", сумма " + items.Sum();
    }
}
~~~
@why
**Multiple enumeration** — классика. Когда есть дорогой источник (БД, сеть, файл), материализуй `ToList()` один раз. Заодно `Count` у списка — свойство O(1), а не `Count()`.
:::

:::compare ToList() в середине цепочки
@intro Смотри на вывод «проверяю»: сколько элементов обработано, чтобы найти первое чётное?
@bad
~~~csharp
using System;
using System.Linq;
var nums = new[] { 1, 2, 3, 4, 5, 6 };
var first = nums
    .Where(x => { Console.WriteLine("проверяю " + x); return x % 2 == 0; })
    .ToList()
    .Select(x => x * x)
    .First();
Console.WriteLine("результат " + first);
~~~
@badwhy
`ToList()` вынуждает обработать **все** элементы и создаёт лишний список, хотя нужен только первый.
@good
~~~csharp
using System;
using System.Linq;
var nums = new[] { 1, 2, 3, 4, 5, 6 };
var first = nums
    .Where(x => { Console.WriteLine("проверяю " + x); return x % 2 == 0; })
    .Select(x => x * x)
    .First();
Console.WriteLine("результат " + first);
~~~
@goodwhy
Лениво: элементы текут по цепочке по одному, и `First()` останавливает перебор на втором. Материализуй в конце — и только если действительно нужен список.
@run
:::

:::cards Итераторы
Отложенное выполнение :: LINQ-запрос выполняется при переборе (foreach, ToList, Count…), а не при объявлении.
yield return :: Компилятор строит конечный автомат: метод приостанавливается между элементами.
Multiple enumeration :: Повторный перебор IEnumerable запускает источник заново — материализуй ToList(), если источник дорог.
Замыкание в запросе :: Лямбда захватывает переменную, а не значение: изменённая до перебора переменная изменит результат.
:::


@@append id="p2-linq"
## Закрепление {#lab}

:::quiz LINQ
? Что выведет код? #net
| var threshold = 2;
| var q = new[] { 1, 2, 3, 4 }.Where(x => x > threshold);
| threshold = 3;
| Console.WriteLine(string.Join(",", q));
- 3,4
+ 4
- 1,2
- 3
= Лямбда захватывает **переменную** `threshold`, а запрос выполняется позже — уже при `threshold = 3`.

? Чем `Single()` отличается от `First()`? #lang
- Ничем
+ `Single` бросает исключение, если элементов не ровно один; `First` берёт первый и бросает только на пустой последовательности
- `First` возвращает последний
- `Single` быстрее
= `Single` — это утверждение «такой элемент ровно один». Для «возможно нет» — `FirstOrDefault`/`SingleOrDefault`.

? Чем `Select` отличается от `SelectMany`? #lang
+ `SelectMany` «разворачивает» коллекции коллекций в плоскую последовательность
- `SelectMany` быстрее
- `Select` работает только со строками
- Ничем
= `orders.SelectMany(o => o.Items)` вернёт все позиции всех заказов одним потоком; `Select(o => o.Items)` вернёт «список списков».

? Почему `IQueryable` отличается от `IEnumerable` в EF Core? #net
- IQueryable не умеет Where
+ Лямбды IQueryable хранятся как деревья выражений и транслируются в SQL; в IEnumerable выполняются в памяти
- IEnumerable быстрее всегда
- Это одно и то же
= `db.Users.Where(u => u.Age > 18)` — фильтр уйдёт в SQL. Если сделать `ToList()` раньше, фильтровать будем уже в памяти приложения — потянем всю таблицу.

? Что произойдёт? #net
| var q = items.OrderBy(x => x.Name);
| var a = q.First();
| var b = q.Last();
- Один проход по items
+ Две сортировки — OrderBy выполняется при каждом перечислении
- Ошибка компиляции
- Сортировка кэшируется
= Результат `OrderBy` не кэшируется: каждый `First()`/`Last()` заново перебирает и сортирует. Материализуй `ToList()`.
:::

:::ide Топ-3 клиента по выручке
@xp 65
@task
Даны заказы. Верни имена **трёх клиентов** с наибольшей суммарной выручкой — по убыванию суммы; при равенстве — по имени (по алфавиту). Решай **только LINQ**, без циклов `for/foreach`.
@code
~~~csharp
using System;
using System.Collections.Generic;
using System.Linq;

public record Order(string Customer, decimal Total);

public static class Solver
{
    public static List<string> TopCustomers(IEnumerable<Order> orders)
    {
        // TODO
        return new List<string>();
    }
}
~~~
@tests
~~~csharp
class T
{
    public static void Run()
    {
        var orders = new List<Order>
        {
            new Order("Аня", 100m), new Order("Боря", 300m), new Order("Аня", 250m),
            new Order("Вера", 50m), new Order("Боря", 40m), new Order("Гена", 350m), new Order("Вера", 200m)
        };
        Assert.Equal(new List<string> { "Аня", "Гена", "Боря" }, Solver.TopCustomers(orders), "Аня и Гена по 350 (по алфавиту), затем Боря 340");
        Assert.Equal(new List<string>(), Solver.TopCustomers(new List<Order>()), "нет заказов");
        var few = new List<Order> { new Order("Ян", 1m) };
        Assert.Equal(new List<string> { "Ян" }, Solver.TopCustomers(few), "клиентов меньше трёх");
    }
}
~~~
@require GroupBy => Нужна группировка (GroupBy)
@forbid \bfor\s*\(|\bforeach\b => Условие: только LINQ, без циклов
@hint
`GroupBy(o => o.Customer)` → `Select(g => new { Name = g.Key, Sum = g.Sum(o => o.Total) })` → `OrderByDescending(x => x.Sum).ThenBy(x => x.Name)` → `Take(3)` → `Select(x => x.Name).ToList()`.
@solution
~~~csharp
using System;
using System.Collections.Generic;
using System.Linq;

public record Order(string Customer, decimal Total);

public static class Solver
{
    public static List<string> TopCustomers(IEnumerable<Order> orders) =>
        orders
            .GroupBy(o => o.Customer)
            .Select(g => new { Name = g.Key, Sum = g.Sum(o => o.Total) })
            .OrderByDescending(x => x.Sum)
            .ThenBy(x => x.Name)
            .Take(3)
            .Select(x => x.Name)
            .ToList();
}
~~~
@why
Конвейер читается сверху вниз как предложение: сгруппировали → посчитали → отсортировали → взяли три. Обрати внимание на `ThenBy` — без него порядок при равных суммах не определён.
:::

:::ticket Снимок «активных» меняется задним числом
@key USR-61
@type Bug
@prio Medium
@reporter Игорь (поддержка)
@labels LINQ, отложенное выполнение
@xp 70
@task
`ActiveNames(users)` должен вернуть **снимок** имён активных пользователей на момент вызова. Сейчас возвращается «живой» запрос: если после вызова список пользователей изменился, в отчёте появляются новые имена и теряются прежние.

**Ожидается:** результат не зависит от последующих изменений `users`.
@code
~~~csharp
using System;
using System.Collections.Generic;
using System.Linq;

public class User
{
    public string Name { get; set; }
    public bool Active { get; set; }
}

public static class Solver
{
    public static IEnumerable<string> ActiveNames(List<User> users)
    {
        return users.Where(u => u.Active).Select(u => u.Name);
    }
}
~~~
@tests
~~~csharp
class T
{
    public static void Run()
    {
        var users = new List<User>
        {
            new User { Name = "Аня", Active = true },
            new User { Name = "Боря", Active = false },
            new User { Name = "Вера", Active = true }
        };
        var names = Solver.ActiveNames(users);
        users.Add(new User { Name = "Гена", Active = true });
        users[0].Active = false;
        Assert.Equal(2, names.Count(), "снимок: Аня и Вера на момент вызова");
        Assert.True(names.Contains("Аня"), "Аня осталась в снимке, хотя уже неактивна");
        Assert.False(names.Contains("Гена"), "новый пользователь в снимок не попал");
    }
}
~~~
@hint
Материализуй результат прямо в методе — `ToList()`. Снимок будет существовать независимо от `users`.
@solution
~~~csharp
using System;
using System.Collections.Generic;
using System.Linq;

public class User
{
    public string Name { get; set; }
    public bool Active { get; set; }
}

public static class Solver
{
    public static List<string> ActiveNames(List<User> users)
    {
        return users.Where(u => u.Active).Select(u => u.Name).ToList();
    }
}
~~~
@why
Возвращать «живой» `IEnumerable` из метода — значит отдавать вместе с ним зависимость от состояния источника. Если нужен снимок — материализуй; если нужна ленивость — договорись об этом в контракте.
:::

:::cards LINQ
Select vs SelectMany :: Select — преобразует элемент в элемент; SelectMany — разворачивает вложенные коллекции в плоскую.
First / Single / OrDefault :: First — первый (исключение на пустом); Single — ровно один; OrDefault возвращает default вместо исключения.
IEnumerable vs IQueryable :: IEnumerable — в памяти (делегаты); IQueryable — дерево выражений, транслируется провайдером (SQL).
OrderBy и повторный перебор :: Не кэшируется: каждый перебор сортирует заново — материализуй ToList().
:::


@@append id="p2-algorithms"
## Закрепление {#lab}

:::quiz Алгоритмы
? Какое условие обязательно для бинарного поиска? #bigo
- Массив из уникальных элементов
+ Массив отсортирован
- Массив чётной длины
- Элементы — целые числа
= Бинарный поиск отбрасывает половину диапазона по сравнению со средним — это работает только на упорядоченных данных.

? Почему в бинарном поиске пишут `mid = lo + (hi - lo) / 2`, а не `(lo + hi) / 2`? #lang
- Это быстрее
+ Чтобы избежать переполнения int при больших lo и hi
- Так требует стандарт
- Для округления вверх
= `lo + hi` может превысить `int.MaxValue` и стать отрицательным. Знаменитая ошибка существовала в JDK десятки лет.

? Худший случай быстрой сортировки (quicksort)? #bigo
- O(N log N)
+ O(N²) — когда опорный элемент всегда минимальный/максимальный (например, уже отсортированный массив с плохим выбором pivot)
- O(N)
- O(log N)
= Поэтому выбирают pivot случайно/медианой из трёх. `Array.Sort` в .NET — introsort: переключается на heapsort при деградации.

? Чем рекурсия опасна на больших входах? #memory
+ Каждый вызов занимает кадр стека — при глубокой рекурсии будет `StackOverflowException` (его не поймать)
- Рекурсия медленнее цикла в 100 раз
- Рекурсия не работает со строками
- В C# рекурсия запрещена
= Размер стека ограничен (~1 МБ на поток). Для глубоких обходов переходи на итерацию с явным стеком или `Stack<T>`.

? Что значит «устойчивая сортировка»? #lang
+ Равные по ключу элементы сохраняют исходный порядок
- Сортировка не падает на пустом массиве
- Сортировка не использует доп. память
- Сортировка всегда O(N)
= `OrderBy` в LINQ устойчив, а `Array.Sort`/`List.Sort` — нет.
:::

:::ticket Бинарный поиск «не видит» последний элемент
@key ALG-5
@type Bug
@prio High
@reporter Лена (продакт)
@labels алгоритмы, границы
@xp 80
@task
`LowerBound(a, x)` должна вернуть **индекс первого элемента ≥ x** в отсортированном массиве (или `a.Length`, если все меньше). Сейчас для некоторых значений ответ неверный, особенно на краях массива.

Решение — бинарный поиск за **O(log N)**: на массиве из миллиона элементов 2000 запросов линейным поиском не пройдут по времени.
@code
~~~csharp
using System;

public static class Solver
{
    public static int LowerBound(int[] a, int x)
    {
        int lo = 0, hi = a.Length - 1;
        while (lo < hi)
        {
            int mid = (lo + hi) / 2;
            if (a[mid] < x) lo = mid + 1;
            else hi = mid;
        }
        return lo;
    }
}
~~~
@tests
~~~csharp
class T
{
    public static void Run()
    {
        var a = new[] { 1, 3, 3, 5, 8 };
        Assert.Equal(0, Solver.LowerBound(a, 0), "меньше всех");
        Assert.Equal(0, Solver.LowerBound(a, 1), "равно первому");
        Assert.Equal(1, Solver.LowerBound(a, 3), "первое из дубликатов");
        Assert.Equal(3, Solver.LowerBound(a, 4), "между элементами");
        Assert.Equal(4, Solver.LowerBound(a, 8), "равно последнему");
        Assert.Equal(5, Solver.LowerBound(a, 9), "больше всех → Length");
        Assert.Equal(0, Solver.LowerBound(new int[0], 5), "пустой массив");

        var big = new int[1000000];
        for (int i = 0; i < big.Length; i++) big[i] = i * 2;
        long sum = 0;
        for (int q = 0; q < 2000; q++) sum += Solver.LowerBound(big, q * 997);
        Assert.Equal(true, sum > 0, "быстро на миллионе элементов");
    }
}
~~~
@hint
Полуинтервал `[lo, hi)`: стартуем с `hi = a.Length` (а не `Length - 1`!), условие `lo < hi`, `mid = lo + (hi - lo) / 2`; при `a[mid] < x` → `lo = mid + 1`, иначе `hi = mid`.
@solution
~~~csharp
using System;

public static class Solver
{
    public static int LowerBound(int[] a, int x)
    {
        int lo = 0, hi = a.Length;
        while (lo < hi)
        {
            int mid = lo + (hi - lo) / 2;
            if (a[mid] < x) lo = mid + 1;
            else hi = mid;
        }
        return lo;
    }
}
~~~
@why
Главное — **инвариант**. Здесь: «ответ всегда лежит в `[lo, hi]`». Правая граница `Length` (не `Length-1`) нужна, потому что ответ «нет такого, все меньше» — это индекс `Length`. Единственная правка в старте — и ошибка на краях ушла.
:::

:::ide Сортировка слиянием
@xp 80
@task
Реализуй `Solver.MergeSort(int[] a)`: верни **новый** отсортированный массив (исходный не меняй). Алгоритм — слияние: раздели пополам, отсортируй рекурсивно, слей. Встроенные `Array.Sort`, `OrderBy`, `List.Sort` — запрещены.
@code
~~~csharp
using System;

public static class Solver
{
    public static int[] MergeSort(int[] a)
    {
        // TODO
        return a;
    }
}
~~~
@tests
~~~csharp
class T
{
    public static void Run()
    {
        Assert.Equal(new int[0], Solver.MergeSort(new int[0]), "пустой");
        Assert.Equal(new[] { 1 }, Solver.MergeSort(new[] { 1 }), "один элемент");
        Assert.Equal(new[] { 1, 2, 3, 5, 8 }, Solver.MergeSort(new[] { 5, 3, 8, 1, 2 }), "обычный");
        Assert.Equal(new[] { 1, 1, 2, 2 }, Solver.MergeSort(new[] { 2, 1, 2, 1 }), "дубликаты");
        var src = new[] { 3, 2, 1 };
        Solver.MergeSort(src);
        Assert.Equal(new[] { 3, 2, 1 }, src, "исходный массив не изменён");

        var big = new int[5000];
        var seed = 12345;
        for (int i = 0; i < big.Length; i++) { seed = (seed * 1103515245 + 12345) & 0x7fffffff; big[i] = seed % 1000; }
        var sorted = Solver.MergeSort(big);
        bool ok = sorted.Length == big.Length;
        for (int i = 1; i < sorted.Length; i++) if (sorted[i - 1] > sorted[i]) ok = false;
        Assert.True(ok, "5000 элементов отсортированы");
    }
}
~~~
@forbid Array\.Sort|OrderBy|\.Sort\( => Встроенные сортировки запрещены
@hint
База рекурсии: длина ≤ 1 → вернуть копию. Иначе: `Array.Copy` в левую/правую половины, `MergeSort` для каждой, затем слияние двумя указателями.
@solution
~~~csharp
using System;

public static class Solver
{
    public static int[] MergeSort(int[] a)
    {
        if (a.Length <= 1) return (int[])a.Clone();
        int mid = a.Length / 2;
        var left = new int[mid];
        var right = new int[a.Length - mid];
        Array.Copy(a, 0, left, 0, mid);
        Array.Copy(a, mid, right, 0, right.Length);
        left = MergeSort(left);
        right = MergeSort(right);

        var res = new int[a.Length];
        int i = 0, j = 0, k = 0;
        while (i < left.Length && j < right.Length)
            res[k++] = left[i] <= right[j] ? left[i++] : right[j++];
        while (i < left.Length) res[k++] = left[i++];
        while (j < right.Length) res[k++] = right[j++];
        return res;
    }
}
~~~
@why
Сложность O(N log N) всегда (дерево делений глубиной log N, на каждом уровне слияние O(N)); устойчива благодаря `<=`; цена — O(N) дополнительной памяти. Запомни шаблон слияния «два указателя» — он нужен в десятках задач.
:::

:::cards Алгоритмы
Бинарный поиск :: O(log N) на отсортированных данных; инвариант границ — главная сложность; mid = lo + (hi - lo) / 2.
Merge sort :: O(N log N) всегда, устойчив, нужна O(N) памяти.
Quicksort :: O(N log N) в среднем, O(N²) в худшем; на практике быстрее за счёт кэша; в .NET — introsort.
Рекурсия :: База + шаг; каждый вызов занимает кадр стека — глубина ограничена (StackOverflow не ловится).
:::


@@append id="p2-solid"
## Закрепление {#lab}

:::quiz SOLID
? Какой принцип нарушает класс `ReportService`, который читает данные из БД, считает метрики, форматирует PDF и отправляет письмо? #oop
+ Single Responsibility (S)
- Liskov (L)
- Interface Segregation (I)
- Open/Closed (O)
= У класса четыре причины меняться (БД, формулы, формат, почта). Разделяем по ответственностям и соединяем через интерфейсы.

? Что означает Open/Closed? #oop
- Классы должны быть открыты для публики
+ Открыты для расширения (новое поведение — новым кодом), закрыты для модификации существующего
- Файлы кода открывают только владельцы
- Методы должны быть virtual
= Добавление нового типа скидки не должно требовать правки `if/switch` в старом коде — используем полиморфизм/стратегию.

? Что нарушает `class Square : Rectangle`, если `SetWidth` у квадрата меняет и высоту? #oop
- DIP
+ Liskov: код, рассчитывающий на независимость сторон прямоугольника, ломается на подтипе
- ISP
- SRP
= Подтип должен вести себя как базовый: «задал ширину 5 и высоту 2 → площадь 10». У квадрата получим 4.

? Интерфейс `IWorker { Work(); Eat(); Sleep(); }`, а роботу еда не нужна. Какой принцип нарушен? #oop
- S
+ I (Interface Segregation) — клиентов не заставляют зависеть от методов, которые им не нужны
- L
- O
= Разбиваем на узкие интерфейсы: `IWorkable`, `IFeedable`.

? Что означает Dependency Inversion? #oop
+ Высокоуровневый код зависит от абстракций, а не от конкретных реализаций; детали подставляются снаружи
- Низкоуровневый код вызывает высокоуровневый
- Зависимости нужно инвертировать в обратном порядке
- Использовать только статические классы
= Не `new SqlRepository()` внутри сервиса, а `IRepository` через конструктор.
:::

:::compare Liskov: Rectangle и Square
@bad
~~~csharp
using System;
class Rectangle
{
    public virtual int Width { get; set; }
    public virtual int Height { get; set; }
    public int Area() => Width * Height;
}
class Square : Rectangle
{
    public override int Width { get => base.Width; set { base.Width = value; base.Height = value; } }
    public override int Height { get => base.Height; set { base.Width = value; base.Height = value; } }
}
static void Resize(Rectangle r)
{
    r.Width = 5;
    r.Height = 2;
    Console.WriteLine("ожидаем 10, получили " + r.Area());
}
Resize(new Rectangle());
Resize(new Square());
~~~
@badwhy
Квадрат — «это прямоугольник» только в математике. В коде `Square` нарушил контракт: после `Width = 5; Height = 2` у него 4 вместо 10. Код, написанный для `Rectangle`, ломается на подтипе — нарушение Liskov.
@good
~~~csharp
using System;
interface IShape { int Area(); }
record Rect(int Width, int Height) : IShape { public int Area() => Width * Height; }
record Sq(int Side) : IShape { public int Area() => Side * Side; }
static void Print(IShape s) => Console.WriteLine("площадь " + s.Area());
Print(new Rect(5, 2));
Print(new Sq(3));
~~~
@goodwhy
Не наследуем «по смыслу», а выделяем общий **контракт** (`Area`). Неизменяемые `record` не дают сломать инвариант присваиванием.
@run
:::

:::ide Стратегия вместо switch (Open/Closed)
@xp 70
@task
Сейчас скидка считается через `switch` по типу клиента — каждая новая скидка правит этот метод. Сделай калькулятор **расширяемым**:
- интерфейс `IDiscount { decimal Apply(decimal price); }`;
- класс `PercentDiscount(decimal percent)` — скидка в процентах;
- `DiscountCalculator`: `Register(string customerType, IDiscount discount)` и `Calculate(string customerType, decimal price)`; для незарегистрированного типа цена остаётся прежней.

В `Calculate` не должно быть `switch` и сравнений типа клиента со строками.
@code
~~~csharp
using System;
using System.Collections.Generic;

public class DiscountCalculator
{
    public decimal Calculate(string customerType, decimal price)
    {
        switch (customerType)
        {
            case "regular": return price;
            case "vip": return price * 0.85m;
            case "employee": return price * 0.7m;
            default: return price;
        }
    }
}
~~~
@tests
~~~csharp
class T
{
    class BlackFriday : IDiscount
    {
        public decimal Apply(decimal price) => price - 100m;
    }

    public static void Run()
    {
        var calc = new DiscountCalculator();
        calc.Register("vip", new PercentDiscount(15m));
        calc.Register("employee", new PercentDiscount(30m));
        Assert.Equal(85m, calc.Calculate("vip", 100m), "vip −15%");
        Assert.Equal(70m, calc.Calculate("employee", 100m), "сотрудник −30%");
        Assert.Equal(100m, calc.Calculate("unknown", 100m), "неизвестный тип — без скидки");

        calc.Register("bf", new BlackFriday());
        Assert.Equal(400m, calc.Calculate("bf", 500m), "новая скидка без правок калькулятора");
    }
}
~~~
@forbid switch|\bcase\b|==\s*" => В калькуляторе не должно быть switch и сравнений со строками
@hint
Храни `Dictionary<string, IDiscount>`. `Calculate`: `TryGetValue` — если есть, `discount.Apply(price)`, иначе `price`.
@solution
~~~csharp
using System;
using System.Collections.Generic;

public interface IDiscount
{
    decimal Apply(decimal price);
}

public class PercentDiscount : IDiscount
{
    private readonly decimal _percent;
    public PercentDiscount(decimal percent) { _percent = percent; }
    public decimal Apply(decimal price) => price * (100m - _percent) / 100m;
}

public class DiscountCalculator
{
    private readonly Dictionary<string, IDiscount> _discounts = new Dictionary<string, IDiscount>();

    public void Register(string customerType, IDiscount discount) => _discounts[customerType] = discount;

    public decimal Calculate(string customerType, decimal price) =>
        _discounts.TryGetValue(customerType, out var d) ? d.Apply(price) : price;
}
~~~
@why
Класс `BlackFriday` в тесте — это «будущая» скидка: она работает **без единой правки** калькулятора. Так выглядит Open/Closed на практике: расширяем добавлением кода, а не редактированием проверенного.
:::

:::legacy God-класс OrderManager
@context Класс «управляет всем, что связано с заказом». Каждая задача по заказам затрагивает его; каждый релиз что-нибудь в нём ломает.
@code
~~~csharp
public class OrderManager
{
    public void CreateOrder(string email, List<Item> items, string card)
    {
        if (string.IsNullOrEmpty(email) || !email.Contains("@")) throw new Exception("bad email");
        decimal total = 0;
        foreach (var i in items) total += i.Price * i.Qty;
        if (total > 1000) total = total * 0.95m;
        var conn = new SqlConnection("Server=prod;Database=shop;User=sa;Password=123456");
        conn.Open();
        var cmd = new SqlCommand("INSERT INTO Orders VALUES ('" + email + "'," + total + ")", conn);
        cmd.ExecuteNonQuery();
        var smtp = new SmtpClient("smtp.company.ru");
        smtp.Send("shop@company.ru", email, "Заказ", "Сумма: " + total);
        Console.WriteLine("Заказ создан");
    }
}
~~~
@bug 3 | [design] Метод делает всё сразу | Валидация, расчёт цены, доступ к БД, отправка почты и логирование в одном методе — нарушение Single Responsibility; любую часть невозможно протестировать отдельно.
@bug 5 | [design] Валидация e-mail через `Contains("@")` и `Exception` | Слабая проверка и общий тип `Exception` вместо конкретного `ArgumentException`/доменной ошибки.
@bug 9 | [design] Магические числа скидки | `1000` и `0.95m` зашиты в код: правило бизнеса должно жить в конфигурации/отдельной политике (и расширяться без правки метода — Open/Closed).
@bug 10-12 | [sec] SQL-инъекция и пароль в коде | Строка склеена из ввода пользователя: `email = "x'); DROP TABLE Orders;--"`. Нужны параметризованные запросы. Пароль `sa` в исходниках — в репозиторий, в логи, во все копии. Соединение и команда не закрываются (`using`).
@bug 10-13 | [leak] `SqlConnection`/`SqlCommand` не освобождаются | При исключении соединение останется открытым — пул исчерпается. Нужен `using`.
@bug 13-15 | [design] `new` для зависимостей (БД, SMTP) | Класс жёстко связан с реализациями — нарушен DIP, тестировать без реальной БД и почты нельзя. Нужны интерфейсы через конструктор.
@fixed
~~~csharp
public class OrderService
{
    private readonly IOrderRepository _repo;
    private readonly INotifier _notifier;
    private readonly IPricing _pricing;

    public OrderService(IOrderRepository repo, INotifier notifier, IPricing pricing)
    {
        _repo = repo; _notifier = notifier; _pricing = pricing;
    }

    public void CreateOrder(Email email, IReadOnlyList<Item> items)
    {
        var total = _pricing.Total(items);
        _repo.Save(new Order(email, total));
        _notifier.OrderCreated(email, total);
    }
}
~~~
:::

:::cards SOLID
SRP :: У класса одна причина для изменения — одна ответственность.
OCP :: Новое поведение добавляется новым кодом (полиморфизм, стратегия), а не правкой старого.
LSP :: Подтип должен безопасно подставляться вместо базового типа, не ломая ожидания клиента.
ISP :: Много узких интерфейсов лучше одного «толстого».
DIP :: Зависим от абстракций; реализации подставляются снаружи (DI).
:::


@@append id="p2-practice"
## Тикеты: инструменты, которые ты напишешь сам {#lab}

:::ticket LRU-кэш для курсов валют
@key CORE-120
@type Story
@prio High
@reporter Макс (TL)
@labels структуры данных, кэш
@xp 120
@minscore 70
@task
Нужен кэш фиксированной ёмкости с вытеснением **наименее недавно использованного** элемента (LRU):

- `LruCache<K, V>(int capacity)`;
- `Put(key, value)`: вставляет/обновляет; при переполнении вытесняется самый давний;
- `TryGet(key, out value)`: возвращает значение и помечает ключ как «только что использованный»;
- `Count`.

Обе операции — за **O(1)**. Подсказка: `Dictionary` + `LinkedList`.
@comment Макс (TL): Классика собеса и реально нужная вещь. Узлы связного списка хранят и ключ, и значение — иначе не сможешь удалить вытесненный ключ из словаря.
@code
~~~csharp
using System;
using System.Collections.Generic;

public class LruCache<K, V>
{
    public LruCache(int capacity)
    {
        throw new NotImplementedException();
    }

    public int Count => 0;

    public void Put(K key, V value)
    {
        throw new NotImplementedException();
    }

    public bool TryGet(K key, out V value)
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
        var c = new LruCache<int, string>(2);
        c.Put(1, "a");
        c.Put(2, "b");
        string v;
        Assert.True(c.TryGet(1, out v), "ключ 1 есть");
        Assert.Equal("a", v, "значение для 1");
        c.Put(3, "c");
        Assert.False(c.TryGet(2, out v), "2 вытеснен как самый давний");
        Assert.True(c.TryGet(1, out v), "1 остался (использовали недавно)");
        Assert.True(c.TryGet(3, out v), "3 на месте");
        Assert.Equal(2, c.Count, "Count не превышает ёмкость");

        c.Put(1, "A");
        Assert.True(c.TryGet(1, out v), "обновлённый ключ");
        Assert.Equal("A", v, "значение обновлено");
        Assert.Equal(2, c.Count, "обновление не увеличивает Count");

        var big = new LruCache<int, int>(1000);
        for (int i = 0; i < 20000; i++) big.Put(i, i);
        int x;
        Assert.False(big.TryGet(0, out x), "старые вытеснены");
        Assert.True(big.TryGet(19999, out x), "свежие на месте");
        Assert.Equal(1000, big.Count, "ёмкость 1000");
    }
}
~~~
@hint
Поля: `Dictionary<K, LinkedListNode<KeyValuePair<K,V>>> _map` и `LinkedList<KeyValuePair<K,V>> _order` (начало списка — самый свежий). При `TryGet`: `_order.Remove(node); _order.AddFirst(node);`.
@hint
При переполнении: `var last = _order.Last; _order.RemoveLast(); _map.Remove(last.Value.Key);`.
@solution
~~~csharp
using System;
using System.Collections.Generic;

public class LruCache<K, V>
{
    private readonly int _capacity;
    private readonly Dictionary<K, LinkedListNode<KeyValuePair<K, V>>> _map = new Dictionary<K, LinkedListNode<KeyValuePair<K, V>>>();
    private readonly LinkedList<KeyValuePair<K, V>> _order = new LinkedList<KeyValuePair<K, V>>();

    public LruCache(int capacity)
    {
        if (capacity < 1) throw new ArgumentOutOfRangeException(nameof(capacity));
        _capacity = capacity;
    }

    public int Count => _map.Count;

    public void Put(K key, V value)
    {
        if (_map.TryGetValue(key, out var node))
        {
            _order.Remove(node);
            _order.AddFirst(new KeyValuePair<K, V>(key, value));
            _map[key] = _order.First;
            return;
        }
        if (_map.Count == _capacity)
        {
            var last = _order.Last;
            _order.RemoveLast();
            _map.Remove(last.Value.Key);
        }
        _order.AddFirst(new KeyValuePair<K, V>(key, value));
        _map[key] = _order.First;
    }

    public bool TryGet(K key, out V value)
    {
        if (_map.TryGetValue(key, out var node))
        {
            _order.Remove(node);
            _order.AddFirst(node);
            value = node.Value.Value;
            return true;
        }
        value = default;
        return false;
    }
}
~~~
@why
Словарь даёт поиск узла за O(1), связный список даёт перестановку узла «в начало» и удаление «с конца» за O(1) — потому что у нас уже есть ссылка на узел. Ни одна из структур по отдельности так не умеет: это пример **комбинирования структур данных**.
:::

:::ticket Группировка анаграмм
@key ALG-14
@type Task
@prio Medium
@reporter Лена (продакт)
@labels Dictionary, строки
@xp 80
@task
Реализуй `GroupAnagrams(string[] words)`: слова, состоящие из одних и тех же букв, попадают в одну группу. Внутри группы порядок — как во входе; группы — в порядке первого появления.

Пример: `["eat","tea","tan","ate","nat","bat"]` → `[["eat","tea","ate"],["tan","nat"],["bat"]]`.
@code
~~~csharp
using System;
using System.Collections.Generic;
using System.Linq;

public static class Solver
{
    public static List<List<string>> GroupAnagrams(string[] words)
    {
        // TODO
        return new List<List<string>>();
    }
}
~~~
@tests
~~~csharp
class T
{
    public static void Run()
    {
        var r = Solver.GroupAnagrams(new[] { "eat", "tea", "tan", "ate", "nat", "bat" });
        Assert.Equal(3, r.Count, "три группы");
        Assert.Equal(new List<string> { "eat", "tea", "ate" }, r[0], "первая группа");
        Assert.Equal(new List<string> { "tan", "nat" }, r[1], "вторая группа");
        Assert.Equal(new List<string> { "bat" }, r[2], "третья группа");
        Assert.Equal(0, Solver.GroupAnagrams(new string[0]).Count, "пустой вход");
    }
}
~~~
@require Dictionary => Подсказка: группируй через Dictionary с «канонической» формой слова в качестве ключа
@hint
Ключ группы — отсортированные буквы слова: `new string(word.OrderBy(c => c).ToArray())`. Словарь `ключ → список слов`; порядок групп — по порядку добавления ключей (список ключей отдельно или `Dictionary` сохраняет порядок вставки при отсутствии удалений).
@solution
~~~csharp
using System;
using System.Collections.Generic;
using System.Linq;

public static class Solver
{
    public static List<List<string>> GroupAnagrams(string[] words)
    {
        var groups = new Dictionary<string, List<string>>();
        var order = new List<string>();
        foreach (var w in words)
        {
            var key = new string(w.OrderBy(c => c).ToArray());
            if (!groups.TryGetValue(key, out var list))
            {
                list = new List<string>();
                groups[key] = list;
                order.Add(key);
            }
            list.Add(w);
        }
        return order.Select(k => groups[k]).ToList();
    }
}
~~~
@why
Приём «**каноническая форма как ключ**»: приводим объекты, которые считаем эквивалентными, к одному представлению — и хэш-таблица группирует за O(N·k log k). Тот же приём в дедупликации e-mail, нормализации путей и т.д.
:::


@@append id="p2-project"
## Код-ревью чужого проекта {#lab}

:::legacy Библиотечный каталог (старый код)
@context Поиск книг «тормозит с ростом каталога», а редактирование «теряет» книги.
@code
~~~csharp
public class Library
{
    public List<Book> Books = new List<Book>();
    public Dictionary<Book, string> Locations = new Dictionary<Book, string>();

    public Book FindByIsbn(string isbn)
    {
        foreach (var b in Books)
            if (b.Isbn == isbn) return b;
        return null;
    }

    public void Rename(Book b, string title)
    {
        b.Title = title;
    }

    public List<Book> Search(string text)
    {
        var res = new List<Book>();
        foreach (var b in Books)
            if (b.Title.ToLower().Contains(text.ToLower()) && !res.Contains(b))
                res.Add(b);
        return res;
    }
}

public class Book
{
    public string Isbn, Title;
    public override bool Equals(object o) { return ((Book)o).Isbn == Isbn; }
    public override int GetHashCode() { return Title.GetHashCode(); }
}
~~~
@bug 2-3 | [design] Публичные изменяемые коллекции | Любой код может добавить/удалить книги в обход `Library`, и два контейнера (`Books`, `Locations`) рассинхронизируются.
@bug 5-9 | [perf] `FindByIsbn` — линейный поиск | O(N) на каждый поиск; на сотнях тысяч книг — тормоза. Индекс `Dictionary<string, Book>` по ISBN даст O(1).
@bug 11-14 | [bug] `Rename` меняет поле, участвующее в `GetHashCode` | Книга уже лежит в `Locations` под старым хэшем — после переименования ключ перестаёт находиться. Хэш должен зависеть от неизменяемого поля (ISBN).
@bug 18-19 | [perf] `ToLower()` на каждой итерации и `res.Contains` | Две лишние аллокации строк на каждую книгу и O(N²) из-за `List.Contains`. Нужны `StringComparison.OrdinalIgnoreCase` и (если дубликаты вообще возможны) `HashSet`.
@bug 27 | [bug] `Equals` приводит `o` без проверки | `(Book)o` бросит `InvalidCastException` или `NullReferenceException` на `null`/чужом типе: контракт Equals требует аккуратной проверки.
@bug 28 | [bug] `GetHashCode` на изменяемом `Title` (и NRE при `Title == null`) | Нарушена согласованность с `Equals` (по ISBN): равные книги дадут разные хэши, плюс падение на `null`.
@fixed
~~~csharp
public sealed class Book : IEquatable<Book>
{
    public string Isbn { get; }
    public string Title { get; set; }
    public Book(string isbn, string title) { Isbn = isbn; Title = title; }

    public bool Equals(Book other) => other is not null && other.Isbn == Isbn;
    public override bool Equals(object o) => Equals(o as Book);
    public override int GetHashCode() => Isbn.GetHashCode();   // только неизменяемое поле
}

public class Library
{
    private readonly Dictionary<string, Book> _byIsbn = new();

    public Book FindByIsbn(string isbn) => _byIsbn.TryGetValue(isbn, out var b) ? b : null;

    public IReadOnlyList<Book> Search(string text) =>
        _byIsbn.Values
               .Where(b => b.Title.Contains(text, StringComparison.OrdinalIgnoreCase))
               .ToList();
}
~~~
:::

:::interview Как устроен Dictionary
@q Как внутри устроен `Dictionary<TKey, TValue>`? Что происходит при `dict[key] = value`?
@trap Понимание хэш-таблицы: хэш → номер корзины → цепочка/сравнение через Equals; коллизии; ресайз; требования к ключам.
@answer
Внутри массив корзин (buckets) и массив записей (entries). Для ключа вызывается `GetHashCode()`, берётся остаток от деления на размер таблицы — это корзина; в ней идёт по цепочке записей: сравниваются хэши и затем `Equals`. Найдена запись — обновляем, иначе добавляем новую. При заполнении таблица расширяется (простое число побольше) и записи **перераспределяются** — O(N), но редко (амортизированно O(1)). Поиск — O(1) в среднем; при множестве коллизий деградирует до O(N). Поэтому ключи должны быть неизменяемыми, а `Equals`/`GetHashCode` — согласованными.
@fail «Это дерево, ключи отсортированы» — нет, это `SortedDictionary`. Порядок обхода `Dictionary` не гарантирован.
@follow Что будет, если `GetHashCode` всегда возвращает 0? (Все ключи в одной корзине — O(N) на операцию.)
:::

:::interview List или LinkedList
@q Когда вы выберете `LinkedList<T>` вместо `List<T>`?
@trap Теория («вставка за O(1)») против практики (кэш процессора, доступ по индексу). Хорошие кандидаты знают, что связный список в .NET — редкий выбор.
@answer
Почти всегда выбираю `List<T>`: данные лежат непрерывно, перебор и индексация быстрые за счёт кэша CPU, меньше аллокаций (нет объекта-узла на каждый элемент). `LinkedList<T>` оправдан, когда нужны **частые вставки/удаления в середине по уже имеющемуся узлу** и стабильные ссылки на узлы — например, в LRU-кэше. Но «добраться» до середины — O(N), и этого часто достаточно, чтобы проиграть списку на практике. Для очереди — `Queue<T>`, для стека — `Stack<T>`.
@fail «LinkedList быстрее, потому что вставка O(1)» — игнорирует стоимость поиска позиции и работу кэша.
:::


@@append id="p2"
## Итоговый тест фазы 2 {#lab}

:::quiz Итог фазы 2: структуры данных, LINQ, сложность
? Какова сложность проверки «есть ли дубликаты» с помощью `HashSet<int>` на N элементах? #bigo
- O(N²)
- O(N log N)
+ O(N) в среднем
- O(1)
= Один проход, `Add`/`Contains` за O(1) в среднем. Через вложенные циклы было бы O(N²), через сортировку — O(N log N).

? Что выведет код? #net
| var list = new List<int> { 1, 2, 3 };
| var q = list.Select(x => { Console.Write(x); return x * 2; });
| Console.Write("A");
| var r = q.ToList();
| Console.Write("B");
- 123AB
+ A123B
- AB123
- 123A
= Select ленив. «A» печатается сразу, а побочные эффекты `Write(x)` — при `ToList()`.

? Почему мутабельные ключи в `Dictionary` опасны? #memory
+ Изменившийся хэш отправит ключ «не в ту корзину», и поиск перестанет его находить
- Они занимают больше памяти
- Словарь не принимает изменяемые типы
- GC не собирает такие ключи
= Хэш вычисляется при вставке. Используй неизменяемые ключи: `string`, `int`, `record`, `readonly struct`.

? Что произойдёт при вызове `list.RemoveAt(0)` в цикле на списке из N элементов? #bigo
+ O(N²) суммарно: каждое удаление сдвигает хвост
- O(N)
- O(N log N)
- O(1)
= Для «обработки с начала» — `Queue<T>`. Для массового удаления — `RemoveAll`.

? Какое утверждение о `IEnumerable<T>` верно? #net
+ Это «рецепт» перебора; результат может вычисляться заново при каждом переборе
- Всегда хранит все элементы в памяти
- Поддерживает индексатор
- Потокобезопасен
= Не путай `IEnumerable<T>` и `List<T>`. Если источник дорогой — материализуй.

? Что нарушает принцип открытости/закрытости? #oop
+ `switch (type)` в методе, который правят при добавлении каждого нового типа
- Использование интерфейса
- Наследование от абстрактного класса
- Внедрение зависимости через конструктор
= OCP: расширять новым кодом (полиморфизм), а не править существующий.

? Дана отсортированная последовательность из 1 000 000 элементов. Сколько примерно сравнений нужно бинарному поиску? #bigo
- 1 000 000
- 1000
+ около 20
- около 500 000
= log₂(10⁶) ≈ 20. Для сравнения линейный поиск — до миллиона.

? Почему `LinkedList<T>` часто медленнее `List<T>`, хотя вставка у него O(1)? #net
+ Узлы разбросаны по памяти (плохая локальность кэша), на каждый элемент — отдельный объект; к нужному узлу ещё надо дойти за O(N)
- Потому что он односвязный
- Потому что не поддерживает foreach
- Это неверно: связный список всегда быстрее
= Алгоритмическая сложность — не вся правда: константы и работа с памятью решают.
:::

:::interview Отложенное выполнение LINQ
@q Что такое отложенное выполнение в LINQ? Приведите пример, когда оно приводит к багу.
@trap Видит ли кандидат различие между построением запроса и его выполнением, и связанные ловушки: multiple enumeration, захваченные переменные, изменение источника.
@answer
Операторы вроде `Where`, `Select`, `OrderBy` не выполняют работу сразу — они строят цепочку итераторов; вычисление идёт при переборе (`foreach`, `ToList`, `Count`, `First`…). Плюсы: ленивость, можно остановиться рано, экономия памяти. Баги: (1) **multiple enumeration** — каждый перебор перезапускает источник (БД, сеть); (2) лямбда захватывает **переменную**, а не значение — изменение до перебора меняет результат; (3) источник изменили между построением и выполнением; (4) возвращая запрос из метода, отдаём зависимость от живого источника. Лечение: `ToList()`/`ToArray()` в нужной точке.
@fail «LINQ работает медленно, потому что всё считает заново» — путает причину и следствие; интервьюер ждёт про момент выполнения.
@follow Какие операторы выполняются немедленно? (`ToList`, `ToArray`, `Count`, `Sum`, `First`, `Any`…)
:::

:::interview IEnumerable против IQueryable
@q В чём разница между `IEnumerable<T>` и `IQueryable<T>`? Почему порядок `ToList()` и `Where()` в EF Core важен?
@trap Понимание, где выполняется фильтр: в SQL или в памяти приложения.
@answer
`IEnumerable<T>` — последовательность в памяти; лямбды компилируются в делегаты (`Func<T,bool>`) и выполняются в процессе. `IQueryable<T>` хранит запрос как **дерево выражений** (`Expression<Func<...>>`), которое провайдер (EF Core) транслирует в SQL и выполняет на сервере БД. Если написать `db.Users.ToList().Where(u => u.Age > 18)`, в приложение загрузится вся таблица, и фильтр сработает в памяти. Правильно: `db.Users.Where(u => u.Age > 18).ToList()` — SQL получит `WHERE`.
@fail «IQueryable — это такой же IEnumerable, просто быстрее». Это не про скорость, а про **место и способ выполнения**.
:::

:::cards Фаза 2: минимум
List<T> :: Массив с ростом ×2; Add амортизированно O(1); Insert/RemoveAt в начале O(N).
Dictionary / HashSet :: O(1) в среднем; Equals + GetHashCode согласованы; ключи неизменяемы.
Big O :: Оценка роста; O(N) — один проход; O(N²) — вложенные циклы; O(log N) — деление пополам.
LINQ :: Ленив; материализуй осознанно; помни про замыкания и multiple enumeration.
SOLID :: S — одна ответственность; O — расширение вместо правки; L — подтипы безопасны; I — узкие интерфейсы; D — зависимость от абстракций.
:::
