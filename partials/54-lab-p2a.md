@@append id="p2-list"
## Закрепление {#lab}

:::quiz List и массивы изнутри
? Почему `List<T>.Add` в среднем O(1), хотя иногда копирует весь массив? #bigo
- Потому что копирование происходит в отдельном потоке
+ Ёмкость растёт в ~2 раза: дорогое копирование случается редко, и в среднем на элемент приходится константа
- Потому что List хранит данные в связном списке
- Это неверно: Add всегда O(N)
= Это **амортизированная** сложность: удвоение ёмкости делает суммарные затраты на N вставок O(N), то есть O(1) на элемент. Если размер известен заранее — `new List<T>(capacity)` избегает копирований.

? Сложность `list.Insert(0, x)` на списке из N элементов? #bigo
- O(1)
- O(log N)
+ O(N) — все элементы сдвигаются вправо
- O(N²)
= `List<T>` — массив под капотом. Вставка/удаление в начале сдвигает хвост. Для очереди используй `Queue<T>`/`LinkedList<T>`/`Deque`.

? Что произойдёт? #lang
| var list = new List<int> { 1, 2, 3, 4 };
| foreach (var x in list)
|     if (x == 2) list.Remove(x);
- Удалится 2, программа продолжит работать
- Удалятся все чётные
+ InvalidOperationException: коллекция была изменена
- Ничего не произойдёт
= Перечислитель `List<T>` хранит версию коллекции; изменение во время `foreach` меняет версию → исключение на следующем `MoveNext`. Решение: `RemoveAll(pred)` или обратный `for`.

? Когда массив лучше `List<T>`? #net
- Когда нужно часто добавлять элементы
+ Когда размер известен и фиксирован, нужна максимальная скорость/минимум накладных расходов
- Когда нужна сортировка
- Никогда
= Массив — фиксированный непрерывный блок. `List<T>` добавляет гибкость ценой небольшой обёртки и запаса ёмкости.
:::

:::ticket «Collection was modified» при очистке корзины
@key SHOP-77
@type Bug
@prio High
@reporter Лена (продакт)
@labels коллекции, исключения
@xp 70
@task
Метод `RemoveOutOfStock(cart, stock)` должен удалить из корзины все позиции, которых нет на складе (`stock[item] == 0` или ключа нет). Сейчас падает с `InvalidOperationException: Collection was modified`.

Удалять нужно **на месте** (метод принимает `List<string>` и меняет его), порядок оставшихся сохранить.
@code
~~~csharp
using System;
using System.Collections.Generic;

public static class Solver
{
    public static void RemoveOutOfStock(List<string> cart, Dictionary<string, int> stock)
    {
        foreach (var item in cart)
        {
            if (!stock.ContainsKey(item) || stock[item] == 0)
                cart.Remove(item);
        }
    }
}
~~~
@tests
~~~csharp
class T
{
    public static void Run()
    {
        var stock = new Dictionary<string, int> { ["apple"] = 5, ["pear"] = 0, ["kiwi"] = 2 };
        var cart = new List<string> { "apple", "pear", "banana", "kiwi", "pear" };
        Solver.RemoveOutOfStock(cart, stock);
        Assert.Equal(new List<string> { "apple", "kiwi" }, cart, "остались только товары в наличии");
        var empty = new List<string>();
        Solver.RemoveOutOfStock(empty, stock);
        Assert.Equal(0, empty.Count, "пустая корзина");
    }
}
~~~
@hint
Изменять коллекцию внутри `foreach` нельзя. Есть метод, который делает это за один проход: `cart.RemoveAll(predicate)`.
@solution
~~~csharp
using System;
using System.Collections.Generic;

public static class Solver
{
    public static void RemoveOutOfStock(List<string> cart, Dictionary<string, int> stock)
    {
        cart.RemoveAll(item => !stock.TryGetValue(item, out var count) || count == 0);
    }
}
~~~
@why
`RemoveAll` — один проход O(N). Наивное решение «обратный `for` с `RemoveAt(i)`» тоже работает, но каждый `RemoveAt` сдвигает хвост — это O(N²) на больших корзинах.
:::

:::compare Список как очередь
@intro Берём элементы «с начала». Выглядит одинаково — сложность разная.
@bad
~~~csharp
using System;
using System.Collections.Generic;
var list = new List<int> { 1, 2, 3, 4, 5 };
while (list.Count > 0)
{
    var x = list[0];
    list.RemoveAt(0);
    Console.Write(x + " ");
}
~~~
@badwhy
`RemoveAt(0)` сдвигает все оставшиеся элементы влево — O(N). Весь цикл — O(N²): на 100 000 элементов это миллиарды копирований.
@good
~~~csharp
using System;
using System.Collections.Generic;
var queue = new Queue<int>(new[] { 1, 2, 3, 4, 5 });
while (queue.Count > 0)
{
    var x = queue.Dequeue();
    Console.Write(x + " ");
}
~~~
@goodwhy
`Queue<T>` — кольцевой буфер: `Dequeue` O(1) без сдвигов. Структуру данных выбираем по операциям, которые чаще всего нужны.
@run
:::

:::cards List
Ёмкость List :: Capacity ≥ Count; при переполнении массив пересоздаётся (обычно ×2) — Add амортизированно O(1).
Insert/RemoveAt в начале :: O(N): сдвиг элементов. Для очереди — Queue<T>.
Collection was modified :: Нельзя менять коллекцию во время foreach. Используй RemoveAll или обратный for.
new List<T>(capacity) :: Резервирует ёмкость: избегает перекопирований, если размер известен заранее.
:::


@@append id="p2-dictionary"
## Закрепление {#lab}

:::quiz Dictionary и HashSet
? Что обязательно нужно переопределить вместе с `Equals`, если объект — ключ словаря? #oop
- ToString
+ GetHashCode
- CompareTo
- Dispose
= Контракт: равные по `Equals` объекты обязаны возвращать одинаковый `GetHashCode`. Иначе словарь ищет не в той корзине и «теряет» ключи.

? Что случится, если изменить поле объекта-ключа, участвующее в `GetHashCode`, после добавления в `Dictionary`? #memory
- Ничего
- Словарь пересчитает хэш сам
+ Ключ окажется в «неправильной» корзине и перестанет находиться
- Бросится исключение
= Хэш вычисляется при вставке. Изменяемые ключи — источник «потерянных» записей. Ключи делают неизменяемыми (`record`, `readonly struct`, строки).

? Какова средняя и худшая сложность поиска в `Dictionary<K,V>`? #bigo
- O(log N) и O(log N)
- O(1) и O(1)
+ O(1) в среднем и O(N) в худшем (много коллизий)
- O(N) и O(N²)
= Хэш-таблица: при хорошей хэш-функции корзины короткие. Плохой `GetHashCode` (например, всегда 0) превращает словарь в список.

? Какой способ чтения значения из словаря «дешевле» и безопаснее? #net
| // A: if (d.ContainsKey(k)) { var v = d[k]; }
| // B: if (d.TryGetValue(k, out var v)) { }
- A
+ B
- Одинаково
- Зависит от типа ключа
= `TryGetValue` ищет ключ **один раз**, `ContainsKey` + индексатор — дважды. Плюс индексатор бросает `KeyNotFoundException`, а `TryGetValue` — нет.
:::

:::ide Two Sum за O(N)
@xp 60
@task
Дан массив чисел и целевая сумма. Верни **индексы** двух разных элементов, дающих в сумме `target` (в порядке возрастания индексов), или `null`, если такой пары нет. Решение должно работать за **O(N)** — на массиве из 50 000 элементов вложенные циклы не уложатся во время.
@code
~~~csharp
using System;
using System.Collections.Generic;

public static class Solver
{
    public static int[] TwoSum(int[] nums, int target)
    {
        for (int i = 0; i < nums.Length; i++)
            for (int j = i + 1; j < nums.Length; j++)
                if (nums[i] + nums[j] == target)
                    return new[] { i, j };
        return null;
    }
}
~~~
@tests
~~~csharp
class T
{
    public static void Run()
    {
        Assert.Equal(new[] { 0, 1 }, Solver.TwoSum(new[] { 2, 7, 11, 15 }, 9), "2+7");
        Assert.Equal(new[] { 1, 2 }, Solver.TwoSum(new[] { 3, 2, 4 }, 6), "2+4");
        Assert.Null(Solver.TwoSum(new[] { 1, 2, 3 }, 100), "пары нет");
        Assert.Equal(new[] { 0, 3 }, Solver.TwoSum(new[] { 5, -3, 8, -5 }, 0), "отрицательные");

        var big = new int[50000];
        for (int i = 0; i < big.Length; i++) big[i] = i * 2;
        var r = Solver.TwoSum(big, 99997 + 0);
        Assert.Null(r, "50 000 элементов, все чётные, сумма нечётная — пары нет (O(N²) здесь не успеет)");
    }
}
~~~
@require Dictionary|HashSet => Для O(N) нужна хэш-таблица
@hint
Идём слева направо и храним в словаре «значение → индекс» уже увиденных чисел. Для текущего `x` ищем `target - x`.
@solution
~~~csharp
using System;
using System.Collections.Generic;

public static class Solver
{
    public static int[] TwoSum(int[] nums, int target)
    {
        var seen = new Dictionary<int, int>();
        for (int i = 0; i < nums.Length; i++)
        {
            if (seen.TryGetValue(target - nums[i], out var j))
                return new[] { j, i };
            seen[nums[i]] = i;
        }
        return null;
    }
}
~~~
@why
Обмен памяти на время: O(N) памяти за O(N) времени вместо O(1) памяти за O(N²). Один проход: если дополнение уже встречалось — пара найдена. `TryGetValue` — один поиск вместо двух.
:::

:::ticket Ключ «пропадает» из словаря
@key GEO-15
@type Bug
@prio High
@reporter Рома (бэкенд)
@labels GetHashCode, Equals
@xp 80
@task
`GeoPoint` используют как ключ словаря и в `HashSet`: две точки с одинаковыми координатами должны считаться одним ключом. Сейчас `visited.Contains(new GeoPoint(1, 2))` возвращает `false`, хотя точка добавлена.

**Ожидается:** равенство по значению (`Lat`, `Lon`): `Equals` + `GetHashCode` + `==`/`!=` не нужны. Структуру менять в `class` нельзя — класс остаётся.
@comment Макс (TL): Контракт: `a.Equals(b)` ⇒ `a.GetHashCode() == b.GetHashCode()`. Проверю на ревью.
@code
~~~csharp
using System;
using System.Collections.Generic;

public class GeoPoint
{
    public int Lat { get; }
    public int Lon { get; }
    public GeoPoint(int lat, int lon) { Lat = lat; Lon = lon; }
}
~~~
@tests
~~~csharp
class T
{
    public static void Run()
    {
        var a = new GeoPoint(1, 2);
        var b = new GeoPoint(1, 2);
        var c = new GeoPoint(2, 1);
        Assert.True(a.Equals(b), "равные координаты — равные точки");
        Assert.False(a.Equals(c), "разные координаты — разные точки");
        Assert.False(a.Equals(null), "null не равен");
        Assert.Equal(a.GetHashCode(), b.GetHashCode(), "равные объекты — равные хэши");

        var visited = new HashSet<GeoPoint> { a };
        Assert.True(visited.Contains(new GeoPoint(1, 2)), "HashSet находит по значению");
        Assert.Equal(1, visited.Count, "дубликат не добавляется");
        visited.Add(b);
        Assert.Equal(1, visited.Count, "повторное добавление не плодит ключи");

        var names = new Dictionary<GeoPoint, string> { [a] = "дом" };
        Assert.Equal("дом", names[new GeoPoint(1, 2)], "Dictionary находит по значению");
    }
}
~~~
@hint
Переопредели `public override bool Equals(object obj)` и `public override int GetHashCode()`. Хэш можно собрать так: `HashCode.Combine(Lat, Lon)` или `Lat * 397 ^ Lon`.
@solution
~~~csharp
using System;
using System.Collections.Generic;

public class GeoPoint
{
    public int Lat { get; }
    public int Lon { get; }
    public GeoPoint(int lat, int lon) { Lat = lat; Lon = lon; }

    public override bool Equals(object obj) =>
        obj is GeoPoint other && other.Lat == Lat && other.Lon == Lon;

    public override int GetHashCode() => HashCode.Combine(Lat, Lon);
}
~~~
@why
Без своего `Equals` сравниваются **ссылки**, поэтому «та же точка» — другой объект — не находится. Пара `Equals`/`GetHashCode` всегда меняется вместе; ещё лучше — `record GeoPoint(int Lat, int Lon)`: компилятор сгенерирует всё сам.
:::

:::cards Dictionary и HashSet
Контракт Equals/GetHashCode :: Равные объекты обязаны иметь равные хэши. Обратное не обязательно (коллизии допустимы).
Коллизия :: Разные ключи с одним номером корзины: хранятся цепочкой/пробированием; много коллизий → O(N).
TryGetValue :: Один поиск и без исключения — лучше ContainsKey + индексатор.
Изменяемый ключ :: Опасен: хэш изменится — ключ «потеряется». Ключи неизменяемы.
HashSet<T> :: Множество без дубликатов: Add/Contains O(1) в среднем.
:::


@@append id="p2-collections"
## Закрепление {#lab}

:::quiz Queue, Stack, LinkedList
? Какая структура подходит для «отмены» (undo) последних действий? #lang
- Queue
+ Stack
- HashSet
- SortedList
= LIFO — последним пришёл, первым вышел: последнее действие отменяется первым. Очередь (FIFO) — для задач в порядке поступления.

? Сложность вставки в середину `LinkedList<T>`, если у вас уже есть ссылка на узел? #bigo
+ O(1)
- O(N)
- O(log N)
- O(N²)
= Двусвязный список переставляет ссылки. Но **добраться** до нужного узла — O(N), поэтому на практике `List<T>` часто быстрее из-за кэша процессора.

? Что вернёт `Peek()` у `Stack<T>`? #lang
- Удалит и вернёт верхний элемент
+ Вернёт верхний элемент, не удаляя
- Вернёт нижний элемент
- Вернёт Count
= `Pop()` убирает, `Peek()` только смотрит. Оба бросают `InvalidOperationException` на пустом стеке.
:::

:::ide Скобочная последовательность
@xp 55
@task
Реализуй `Solver.IsBalanced(string s)`: строка состоит из скобок `()[]{}` (и, возможно, других символов, которые игнорируются). Верни `true`, если скобки сбалансированы и правильно вложены.

Примеры: `"([]{})"` — да; `"([)]"` — нет; `"(("` — нет; `""` — да.
@code
~~~csharp
using System;
using System.Collections.Generic;

public static class Solver
{
    public static bool IsBalanced(string s)
    {
        // TODO
        return false;
    }
}
~~~
@tests
~~~csharp
class T
{
    public static void Run()
    {
        Assert.True(Solver.IsBalanced(""), "пусто");
        Assert.True(Solver.IsBalanced("([]{})"), "вложенные");
        Assert.True(Solver.IsBalanced("a(b[c]{d})e"), "с посторонними символами");
        Assert.False(Solver.IsBalanced("([)]"), "пересечение");
        Assert.False(Solver.IsBalanced("(("), "не закрыта");
        Assert.False(Solver.IsBalanced("))"), "лишняя закрывающая");
        Assert.False(Solver.IsBalanced("]"), "закрывающая без пары");
    }
}
~~~
@require Stack => Условие: используй Stack<char>
@hint
Открывающую скобку кладём в стек. Закрывающую сравниваем с вершиной: если стек пуст или пара не та — `false`. В конце стек должен быть пуст.
@solution
~~~csharp
using System;
using System.Collections.Generic;

public static class Solver
{
    public static bool IsBalanced(string s)
    {
        var stack = new Stack<char>();
        foreach (char c in s)
        {
            if (c == '(' || c == '[' || c == '{') stack.Push(c);
            else if (c == ')' || c == ']' || c == '}')
            {
                if (stack.Count == 0) return false;
                char open = stack.Pop();
                if ((c == ')' && open != '(') || (c == ']' && open != '[') || (c == '}' && open != '{')) return false;
            }
        }
        return stack.Count == 0;
    }
}
~~~
@why
Скобки — это вложенность, а вложенность — это стек (так устроены и вызовы методов). Три ошибки, которые ловят тесты: пустой стек при закрывающей, неправильная пара, и **остаток в стеке** в конце.
:::

:::cards Коллекции
Stack<T> :: LIFO: Push/Pop/Peek O(1). Undo, обход в глубину, разбор скобок.
Queue<T> :: FIFO: Enqueue/Dequeue O(1). Очереди задач, обход в ширину.
LinkedList<T> :: Двусвязный список: вставка по узлу O(1), доступ по индексу O(N); часто проигрывает List из-за кэша CPU.
SortedDictionary / SortedSet :: Упорядоченные по ключу, операции O(log N) (дерево).
:::


@@append id="p2-bigo"
## Закрепление {#lab}

:::quiz Big O
? Какая сложность? #bigo
| for (int i = 0; i < n; i++)
|     for (int j = i; j < n; j++)
|         Do();
- O(N)
- O(N log N)
+ O(N²)
- O(2ᴺ)
= Внутренний цикл выполняется N, N−1, … 1 раз — это N(N+1)/2 ≈ N²/2 → O(N²). Константа ½ в Big O отбрасывается.

? Какая сложность? #bigo
| int steps = 0;
| for (int i = n; i > 1; i /= 2) steps++;
- O(N)
+ O(log N)
- O(√N)
- O(1)
= Каждый шаг делит `i` пополам — так работает бинарный поиск. За log₂N шагов дойдём до 1.

? Какая сложность наивной рекурсии `Fib(n) = Fib(n-1) + Fib(n-2)`? #bigo
- O(N)
- O(N²)
+ O(2ᴺ)
- O(log N)
= Дерево вызовов ветвится в два на каждом уровне, и подзадачи пересчитываются. Мемоизация/цикл делают за O(N).

? Что лучше при больших N: O(N log N) или O(N²)? #bigo
+ O(N log N) — растёт заметно медленнее
- O(N²)
- Одинаково
- Зависит от языка
= Для N = 1 000 000: N log N ≈ 2·10⁷, N² = 10¹². Сортировка за N log N — норма; вложенные циклы по большим данным — красный флаг.

? Что означает «амортизированная O(1)»? #bigo
- В худшем случае операция O(1)
+ Среднее по серии операций — константа, хотя отдельная операция может быть дорогой
- Операция выполняется за константу всегда
- Это O(log N)
= Пример — `List<T>.Add`: редкое копирование массива «размазывается» по многим дешёвым вставкам.
:::

:::ticket Отчёт по пересечению списков «подвисает»
@key REP-9
@type Bug
@prio High
@reporter Аня (аналитика)
@labels производительность, Big O
@xp 90
@task
`CommonCount(a, b)` считает, сколько **уникальных** чисел из `a` встречается в `b`. На списках по 30 000 элементов отчёт считается минуты.

**Ожидается:** тот же результат за O(N + M). Тест на больших данных не уложится во время при вложенных циклах.
@comment Макс (TL): Профилировать здесь нечего — виновата сложность. Какая структура даёт поиск за O(1)?
@code
~~~csharp
using System;
using System.Collections.Generic;

public static class Solver
{
    public static int CommonCount(List<int> a, List<int> b)
    {
        var counted = new List<int>();
        foreach (var x in a)
        {
            if (b.Contains(x) && !counted.Contains(x))
                counted.Add(x);
        }
        return counted.Count;
    }
}
~~~
@tests
~~~csharp
class T
{
    public static void Run()
    {
        Assert.Equal(2, Solver.CommonCount(new List<int> { 1, 2, 3, 2 }, new List<int> { 2, 3, 4 }), "малый пример");
        Assert.Equal(0, Solver.CommonCount(new List<int>(), new List<int> { 1 }), "пустой список");

        var a = new List<int>(); var b = new List<int>();
        for (int i = 0; i < 30000; i++) { a.Add(i); b.Add(i + 15000); }
        Assert.Equal(15000, Solver.CommonCount(a, b), "30 000 × 30 000");
    }
}
~~~
@require HashSet => Нужен HashSet: поиск по списку внутри цикла — это и есть O(N²)
@hint
Положи `b` в `HashSet<int>`; результат — `HashSet<int>` уникальных общих элементов. Поиск `Contains` у HashSet — O(1).
@solution
~~~csharp
using System;
using System.Collections.Generic;

public static class Solver
{
    public static int CommonCount(List<int> a, List<int> b)
    {
        var inB = new HashSet<int>(b);
        var common = new HashSet<int>();
        foreach (var x in a)
        {
            if (inB.Contains(x)) common.Add(x);
        }
        return common.Count;
    }
}
~~~
@why
Было O(N·M + N·K) — вложенный поиск по спискам. Стало O(N + M): хэш-множества дают поиск за O(1). Это самое частое оптимизационное улучшение в реальном коде: **поменяй структуру данных, а не «оптимизируй цикл»**.
:::

:::compare Вложенные циклы против хэш-множества
@bad
~~~csharp
using System;
using System.Collections.Generic;
var names = new List<string> { "ann", "bob", "ann", "cat", "bob" };
var unique = new List<string>();
foreach (var n in names)
{
    if (!unique.Contains(n)) unique.Add(n);
}
Console.WriteLine(string.Join(",", unique));
~~~
@badwhy
`unique.Contains` — линейный поиск, внутри цикла: O(N²). На 100 000 имён — десять миллиардов сравнений.
@good
~~~csharp
using System;
using System.Collections.Generic;
var names = new List<string> { "ann", "bob", "ann", "cat", "bob" };
var seen = new HashSet<string>();
var unique = new List<string>();
foreach (var n in names)
{
    if (seen.Add(n)) unique.Add(n);
}
Console.WriteLine(string.Join(",", unique));
~~~
@goodwhy
`HashSet.Add` возвращает `false`, если элемент уже есть — проверка и вставка за один O(1)-шаг, порядок первого появления сохранён.
@run
:::

:::cards Big O
O(1), O(log N), O(N), O(N log N), O(N²) :: Константа, бинарный поиск/дерево, один проход, хорошая сортировка, вложенные циклы.
Амортизированная сложность :: Средняя стоимость операции в серии; List.Add — O(1) амортизированно.
Худший / средний случай :: Quicksort: O(N log N) в среднем, O(N²) в худшем; Dictionary: O(1) в среднем, O(N) в худшем.
Время против памяти :: Часто обмениваем память на скорость: HashSet/Dictionary-кэши превращают O(N²) в O(N).
:::


@@append id="p2-generics"
## Закрепление {#lab}

:::quiz Generics
? Что обеспечивает ограничение `where T : class, new()`? #lang
- T — только структура
+ T — ссылочный тип с публичным конструктором без параметров
- T — любой тип
- T — наследник object и интерфейса
= `class` — ссылочный тип, `new()` — разрешает `new T()`. Ограничения дают компилятору право на операции над T.

? Почему `List<int>` быстрее `ArrayList`? #net
+ Нет боксинга и приведений типа: значения хранятся прямо в `int[]`
- Потому что List потокобезопасен
- Потому что ArrayList использует связный список
- Разницы нет
= Дженерики в .NET **реифицированы**: для значимых типов JIT делает специализацию, и боксинг не нужен.

? Что значит `IEnumerable<out T>` (ковариантность)? #oop
+ `IEnumerable<string>` можно присвоить переменной `IEnumerable<object>`
- `T` можно только возвращать из методов и принимать в параметрах
- `IEnumerable<object>` можно присвоить `IEnumerable<string>`
- Ковариантности в C# нет
= `out T` — тип только «выходит», поэтому подтип безопасно использовать как базовый. `List<string>` в `List<object>` присвоить нельзя: через него можно было бы положить число.
:::

:::ide Свой дженерик-стек
@xp 65
@task
Реализуй дженерик-класс `MyStack<T>`:
- `Push(T item)`, `T Pop()`, `T Peek()`, свойство `Count`;
- `Pop`/`Peek` на пустом стеке → `InvalidOperationException("Stack is empty")`.

Внутри — **массив `T[]`**, который сам расширяется в 2 раза (готовые `List<T>`/`Stack<T>` использовать нельзя).
@code
~~~csharp
using System;

public class MyStack<T>
{
    // TODO
}
~~~
@tests
~~~csharp
class T
{
    public static void Run()
    {
        var s = new MyStack<int>();
        Assert.Equal(0, s.Count, "новый стек пуст");
        for (int i = 1; i <= 10; i++) s.Push(i);
        Assert.Equal(10, s.Count, "10 элементов (с ростом массива)");
        Assert.Equal(10, s.Peek(), "Peek возвращает вершину");
        Assert.Equal(10, s.Count, "Peek не удаляет");
        Assert.Equal(10, s.Pop(), "Pop возвращает 10");
        Assert.Equal(9, s.Pop(), "Pop возвращает 9");
        Assert.Equal(8, s.Count, "Count уменьшился");

        var str = new MyStack<string>();
        str.Push("a"); str.Push("b");
        Assert.Equal("b", str.Pop(), "работает со строками");

        var empty = new MyStack<double>();
        var ex = Assert.Throws<InvalidOperationException>(() => empty.Pop(), "Pop пустого");
        Assert.True(ex != null && ex.Message == "Stack is empty", "текст исключения");
        Assert.Throws<InvalidOperationException>(() => empty.Peek(), "Peek пустого");
    }
}
~~~
@forbid \b(List|Stack|Queue)< => Условие: свой массив T[], без готовых коллекций
@hint
Поля: `private T[] _items = new T[4]; private int _count;`. В `Push`, если `_count == _items.Length`, создай массив вдвое больше и скопируй (`Array.Copy` или цикл).
@solution
~~~csharp
using System;

public class MyStack<T>
{
    private T[] _items = new T[4];
    private int _count;

    public int Count => _count;

    public void Push(T item)
    {
        if (_count == _items.Length)
        {
            var bigger = new T[_items.Length * 2];
            Array.Copy(_items, bigger, _count);
            _items = bigger;
        }
        _items[_count++] = item;
    }

    public T Pop()
    {
        if (_count == 0) throw new InvalidOperationException("Stack is empty");
        T item = _items[--_count];
        _items[_count] = default;   // не держим ссылку — GC сможет собрать объект
        return item;
    }

    public T Peek()
    {
        if (_count == 0) throw new InvalidOperationException("Stack is empty");
        return _items[_count - 1];
    }
}
~~~
@why
Три ключевых идеи: (1) **удвоение ёмкости** → Push амортизированно O(1); (2) `default` в освободившейся ячейке, иначе стек «держит» объект и мешает GC — тонкая утечка памяти; (3) единая обработка пустого стека.
:::

:::cards Generics
where T : class / struct / new() :: Ограничения типа-параметра: ссылочный / значимый / есть публичный конструктор без параметров.
Ковариантность (out) :: IEnumerable<string> → IEnumerable<object>: тип только на выходе.
Контравариантность (in) :: Action<object> → Action<string>: тип только на входе.
Преимущество дженериков :: Типобезопасность на этапе компиляции + отсутствие боксинга и приведений.
:::
