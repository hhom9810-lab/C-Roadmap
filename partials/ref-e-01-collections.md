@@ref id="co-list" cat="E" title="List<T>: устройство и ёмкость" cs="2.0" cx="доступ O(1), вставка O(n)" mem="O(n)" tags="List<T> динамический массив Capacity Count Add Insert RemoveAt ёмкость рост удвоение CollectionsMarshal AsSpan BinarySearch" topic="p2-list" related="ty-arrays,co-interfaces,co-complexity,fl-foreach" learn="dotnet/api/system.collections.generic.list-1::List<T>"
`List<T>` — динамический массив: внутри хранится обычный массив, который при заполнении заменяется вдвое большим. Это самая используемая коллекция .NET.

## Синтаксис {#syntax}

~~~csharp @nocheck
var xs = new List<int> { 1, 2, 3 };
List<string> names = [];                 // выражение коллекции (C# 12)
xs.Add(4);  xs.Insert(0, 9);  xs.RemoveAt(1);  xs.Remove(3);
int i = xs.IndexOf(4);  bool has = xs.Contains(2);
xs.Sort();  xs.Reverse();  xs.AddRange(other);
var list = new List<int>(capacity: 1000);
~~~

## Семантика {#semantics}

- `Count` — число элементов, `Capacity` — размер внутреннего массива. Когда `Count` достигает `Capacity`, массив заменяется новым вдвое большего размера (начальная ёмкость 4), элементы копируются.
- Индексатор и `Add` в конец — `O(1)` (амортизированно); `Insert` и `RemoveAt` в середине — `O(n)` из-за сдвига; `Contains`, `IndexOf`, `Remove` — линейный поиск `O(n)`.
- Заранее известный размер задавайте в конструкторе: `new List<T>(n)` исключает копирования; `TrimExcess()` возвращает лишнюю память.
- `List<T>` разрешает дубликаты и сохраняет порядок вставки; сортировка — `Sort()` (интроспективная, **нестабильная**) или `OrderBy` в LINQ (стабильная).
- Изменение списка во время `foreach` запрещено ([обход](#/ref/d/fl-foreach)); для удаления используйте `RemoveAll`.
- Элементы-структуры нельзя изменить через индексатор по месту (`list[0].X = 1` — ошибка CS1612): вы получите копию. Замените элемент целиком или используйте `CollectionsMarshal.AsSpan`.
- `List<T>` не потокобезопасен для записи; параллельный `Add` из нескольких потоков приводит к потере данных и исключениям.
- Для неизменяемого представления отдавайте `IReadOnlyList<T>` или `ReadOnlyCollection<T>` ([интерфейсы](#/ref/e/co-interfaces)).
- `BinarySearch` работает только по отсортированному списку и возвращает побитовое дополнение индекса, если элемента нет.

## Под капотом {#internals}

Поля: `T[] _items`, `int _size`, `int _version`. `_version` увеличивается при каждом изменении и проверяется перечислителем — отсюда исключение при изменении во время обхода. Рост — `Array.Resize`-подобное копирование через `Array.Copy` (быстрая memmove).

## Сложность {#complexity}

Доступ по индексу `O(1)`; `Add` — `O(1)` амортизированно, `O(n)` в момент роста; `Insert/RemoveAt` — `O(n)`; поиск — `O(n)`; `Sort` — `O(n log n)`. Память — `O(n)` с запасом до 2n.

## Версии {#versions}

- .NET 2.0 — `List<T>`; C# 3 — инициализаторы коллекций; C# 12 — выражения коллекций `[1, 2, 3]`.
- .NET 5 — `CollectionsMarshal.AsSpan` для прямого доступа к данным списка.

## Ловушки {#pitfalls}

**Вставки в начало превращают алгоритм в квадратичный.**

~~~csharp
var xs = new List<int>();
for (int i = 0; i < 5; i++) xs.Insert(0, i);        // ❌ каждый раз сдвиг всех элементов
Console.WriteLine(string.Join(",", xs));

var q = new LinkedList<int>();
for (int i = 0; i < 5; i++) q.AddFirst(i);
Console.WriteLine(string.Join(",", q));

var ys = new List<int>(capacity: 4);
for (int i = 0; i < 5; i++) ys.Add(i);
Console.WriteLine($"{ys.Count} {ys.Capacity}");
~~~
~~~console
4,3,2,1,0
4,3,2,1,0
5 8
~~~

**Изменение списка при обходе** — `InvalidOperationException`.

**Структуры в списке:** изменения копии теряются.

**Утечка ссылок:** `Clear()` обнуляет ссылки, а `RemoveAt` — тоже, но большой список не уменьшается сам.

## Примеры {#examples}

~~~csharp
var names = new List<string> { "Борис", "Анна", "Вера" };
names.Sort();
Console.WriteLine(string.Join(", ", names));
names.RemoveAll(n => n.StartsWith('Б'));
Console.WriteLine(names.Count);
Console.WriteLine(names.IndexOf("Вера"));
Console.WriteLine(names.BinarySearch("Вера"));
~~~
~~~console
Анна, Борис, Вера
2
1
1
~~~

@@ref id="co-dictionary" cat="E" title="Dictionary<TKey, TValue>" cs="2.0" cx="O(1) в среднем" mem="O(n)" tags="Dictionary словарь хеш-таблица ключ значение TryGetValue GetHashCode коллизии TryAdd CollectionsMarshal GetValueRefOrAddDefault порядок перебора" topic="p2-dictionary" related="co-equality,co-hashset,co-complexity,co-concurrent" learn="dotnet/api/system.collections.generic.dictionary-2::Dictionary<TKey,TValue>"
Словарь хранит пары «ключ → значение» в хеш-таблице: поиск, вставка и удаление в среднем занимают постоянное время.

## Синтаксис {#syntax}

~~~csharp @nocheck
var d = new Dictionary<string, int> { ["a"] = 1, ["b"] = 2 };
d["c"] = 3;                       // добавить или заменить
d.Add("d", 4);                    // бросит ArgumentException, если ключ есть
if (d.TryGetValue("a", out var v)) { ... }
d.TryAdd("a", 99);  d.Remove("b");
foreach (var (k, val) in d) { ... }
var d2 = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
~~~

## Семантика {#semantics}

- Ключи уникальны и не могут быть `null`. Сравнение выполняется через `IEqualityComparer<TKey>` (по умолчанию — `Equals` и `GetHashCode` типа ключа).
- Чтение индексатором `d[k]` бросает `KeyNotFoundException`, если ключа нет; для безопасного чтения — `TryGetValue` или `GetValueOrDefault`.
- `Add` при существующем ключе бросает исключение, `d[k] = v` — заменяет значение, `TryAdd` — возвращает `false`.
- Порядок перебора не документирован как гарантированный: на практике он близок к порядку вставки, пока не было удалений, но полагаться нельзя.
- Изменяемые ключи опасны: после изменения полей, участвующих в `GetHashCode`, элемент «теряется» в таблице.
- Для строк выбирайте компаратор явно: `StringComparer.Ordinal`, `OrdinalIgnoreCase` (регистр, быстро) вместо культурных сравнений.
- `Dictionary` не потокобезопасен; для параллельной работы используйте `ConcurrentDictionary` ([конкурентные коллекции](#/ref/e/co-concurrent)).
- Подсчёт частот: `d[k] = d.GetValueOrDefault(k) + 1`; группировку удобно делать через `GroupBy` или `CollectionsMarshal.GetValueRefOrAddDefault`.
- Удаление во время обхода допустимо в .NET Core 3.0+ (`Remove` не ломает перечислитель), но добавление — нет.
- Начальную ёмкость задавайте через `new Dictionary<K,V>(capacity)`, если число ключей известно: это исключает перераспределения. Для частого перебора только значений используйте свойство `Values`, только ключей — `Keys`; обе коллекции «живые» и меняются вместе со словарём.

## Под капотом {#internals}

Массивы `buckets` и `entries`: индекс корзины — `hash % buckets.Length`, внутри корзины записи связаны в цепочку через поле `next`. При заполнении размер увеличивается до следующего простого числа, а записи перераспределяются. Для типов-значений без пользовательского компаратора вызовы `Equals`/`GetHashCode` девиртуализируются.

## Сложность {#complexity}

Поиск, вставка, удаление — `O(1)` в среднем и `O(n)` в худшем случае при плохом хеше. Память — `O(n)` с запасом на корзины. Рост — `O(n)` перераспределения, амортизированно `O(1)`.

## Версии {#versions}

- .NET 2.0 — `Dictionary<,>`; .NET Core 2.0 — `TryAdd`; .NET Core 3.0 — безопасное `Remove` при обходе.
- .NET 5 — `CollectionsMarshal.GetValueRefOrAddDefault`; .NET 8 — `FrozenDictionary`.

## Ловушки {#pitfalls}

**Ключ без правильного равенства.**

~~~csharp
var bad = new Dictionary<Pt, string> { [new Pt(1, 2)] = "a" };
Console.WriteLine(bad.ContainsKey(new Pt(1, 2)));        // ❌ класс сравнивается по ссылке

var good = new Dictionary<Rec, string> { [new Rec(1, 2)] = "a" };
Console.WriteLine(good.ContainsKey(new Rec(1, 2)));      // ✅ record сравнивается по значению

var d = new Dictionary<string, int>();
foreach (var w in "a b a c a b".Split(' ')) d[w] = d.GetValueOrDefault(w) + 1;
Console.WriteLine(string.Join(" ", d.OrderBy(p => p.Key).Select(p => p.Key + "=" + p.Value)));

class Pt(int x, int y) { public int X => x; public int Y => y; }
record Rec(int X, int Y);
~~~
~~~console
False
True
a=3 b=2 c=1
~~~

**Чтение несуществующего ключа через индексатор.**

**Строковые ключи без компаратора** зависят от регистра и культуры.

**Изменяемый ключ** нарушает таблицу.

## Примеры {#examples}

~~~csharp
var stock = new Dictionary<string, int> { ["яблоко"] = 5, ["груша"] = 0 };
if (stock.TryGetValue("яблоко", out var n)) Console.WriteLine($"яблок: {n}");
Console.WriteLine(stock.TryAdd("груша", 3));
Console.WriteLine(stock.TryAdd("слива", 7));
Console.WriteLine(string.Join(", ", stock.OrderBy(p => p.Key).Select(p => $"{p.Key}:{p.Value}")));

var ci = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase) { ["Key"] = 1 };
Console.WriteLine(ci["KEY"]);
~~~
~~~console
яблок: 5
False
True
груша:0, слива:7, яблоко:5
1
~~~

@@ref id="co-hashset" cat="E" title="HashSet<T> и операции над множествами" cs="3.5" cx="O(1) в среднем" mem="O(n)" tags="HashSet множество уникальные UnionWith IntersectWith ExceptWith SortedSet Contains Add дубликаты SetEquals" topic="p2-collections" related="co-dictionary,co-equality,co-complexity" learn="dotnet/api/system.collections.generic.hashset-1::HashSet<T>"
`HashSet<T>` хранит уникальные элементы без порядка и отвечает на вопрос «есть ли такой элемент» за постоянное время; к нему прилагаются операции теории множеств.

## Синтаксис {#syntax}

~~~csharp @nocheck
var s = new HashSet<int> { 1, 2, 3 };
bool added = s.Add(2);                  // false, уже есть
s.Contains(3);  s.Remove(1);
s.UnionWith(other);  s.IntersectWith(other);  s.ExceptWith(other);
s.IsSubsetOf(other);  s.Overlaps(other);  s.SetEquals(other);
var sorted = new SortedSet<int>(s);
~~~

## Семантика {#semantics}

- `Add` возвращает `true`, если элемент добавлен, и `false`, если он уже был — удобно для поиска дубликатов в один проход.
- Равенство элементов определяется `Equals`/`GetHashCode` или переданным `IEqualityComparer<T>`.
- `UnionWith`, `IntersectWith`, `ExceptWith`, `SymmetricExceptWith` **изменяют** текущее множество на месте; LINQ-аналоги (`Union`, `Intersect`, `Except`) возвращают новые последовательности.
- Проверки отношений: `IsSubsetOf`, `IsSupersetOf`, `Overlaps`, `SetEquals`.
- Порядок элементов не определён; нужен порядок — `SortedSet<T>` (красно-чёрное дерево, операции за `O(log n)`).
- `HashSet<T>` быстрее `List<T>.Contains` на больших объёмах: поиск `O(1)` против `O(n)`.
- Для удаления дубликатов с сохранением порядка используйте `Distinct()` или `HashSet` в цикле с проверкой `Add`.
- Изменяемые элементы с неустойчивым хеш-кодом ломают множество так же, как ключи словаря.
- Потокобезопасного `HashSet` нет; для параллельных сценариев — `ConcurrentDictionary<T, byte>` или блокировка.
- На практике `HashSet` нужен для фильтрации дубликатов, проверки разрешённых значений, пересечения списков идентификаторов и отслеживания посещённых вершин графа. Для небольших фиксированных наборов (до пары десятков элементов) массив с линейным поиском часто не медленнее.
- Не забывайте о компараторе: для строк, сравниваемых без учёта регистра, передайте `StringComparer.OrdinalIgnoreCase` при создании — менять его после создания нельзя.
- Метод `ToHashSet()` в LINQ создаёт множество из любой последовательности и принимает компаратор вторым аргументом.

## Под капотом {#internals}

Устройство такое же, как у словаря, но без значений: массив корзин и записей с цепочками. Объединение и пересечение с другим `HashSet` с тем же компаратором оптимизированы без промежуточных коллекций.

## Сложность {#complexity}

`Add`, `Contains`, `Remove` — `O(1)` в среднем; операции над множествами — `O(m)` по размеру второго операнда. `SortedSet` — `O(log n)`.

## Версии {#versions}

- .NET 3.5 — `HashSet<T>`; .NET Framework 4.0 — `SortedSet<T>`.
- .NET 5 — `TryGetValue`; .NET 8 — `FrozenSet<T>` для неизменяемых наборов.

## Ловушки {#pitfalls}

**Поиск дубликатов за один проход.**

~~~csharp
var seen = new HashSet<string>();
var dups = new List<string>();
foreach (var w in "a b a c b d".Split(' ')) if (!seen.Add(w)) dups.Add(w);
Console.WriteLine(string.Join(",", dups));

var a = new HashSet<int> { 1, 2, 3 };
var b = new HashSet<int> { 2, 3, 4 };
var u = new HashSet<int>(a); u.UnionWith(b);
var i = new HashSet<int>(a); i.IntersectWith(b);
Console.WriteLine($"{string.Join(",", u.Order())} | {string.Join(",", i.Order())}");
a.ExceptWith(b);                         // ❌ изменяет a на месте
Console.WriteLine(string.Join(",", a));
~~~
~~~console
a,b
1,2,3,4 | 2,3
1
~~~

**Ожидание порядка** вставки при переборе.

**Мутация элементов**, влияющих на хеш.

**`UnionWith` меняет исходное множество** — копируйте, если оригинал нужен.

## Примеры {#examples}

~~~csharp
var allowed = new HashSet<string>(StringComparer.OrdinalIgnoreCase) { "admin", "editor" };
foreach (var role in new[] { "Admin", "guest", "EDITOR" })
    Console.WriteLine($"{role}: {allowed.Contains(role)}");

var s1 = new HashSet<int> { 1, 2 };
var s2 = new HashSet<int> { 2, 1 };
Console.WriteLine(s1.SetEquals(s2));
Console.WriteLine(new SortedSet<int> { 5, 1, 3 }.Min);
~~~
~~~console
Admin: True
guest: False
EDITOR: True
True
1
~~~

@@ref id="co-queue-stack" cat="E" title="Queue<T>, Stack<T>, PriorityQueue и LinkedList" cs="2.0" cx="O(1) / O(log n)" mem="O(n)" tags="Queue Stack PriorityQueue LinkedList очередь стек FIFO LIFO Enqueue Dequeue Push Pop Peek приоритет обход графа BFS DFS" topic="p2-collections" related="co-list,co-complexity,co-interfaces" learn="dotnet/api/system.collections.generic.queue-1::Queue<T>"
`Queue<T>` работает по принципу «первым пришёл — первым вышел», `Stack<T>` — «последним пришёл — первым вышел», а `PriorityQueue` отдаёт элемент с наименьшим приоритетом.

## Синтаксис {#syntax}

~~~csharp @nocheck
var q = new Queue<int>();   q.Enqueue(1);  int a = q.Dequeue();  q.Peek();  q.TryDequeue(out var x);
var s = new Stack<int>();   s.Push(1);     int b = s.Pop();      s.Peek();
var pq = new PriorityQueue<string, int>();  pq.Enqueue("задача", priority: 2);  pq.Dequeue();
var l = new LinkedList<int>();  l.AddLast(1);  l.AddFirst(0);
~~~

## Семантика {#semantics}

- `Queue<T>` и `Stack<T>` построены на массиве; добавление и извлечение — `O(1)` (амортизированно, как у `List<T>`).
- `Dequeue`/`Pop`/`Peek` на пустой коллекции бросают `InvalidOperationException`; безопасные версии — `TryDequeue`, `TryPop`, `TryPeek`.
- Очередь подходит для обхода в ширину (BFS), планировщиков задач, буферов; стек — для обхода в глубину (DFS), отмены действий, разбора выражений.
- `PriorityQueue<TElement, TPriority>` (.NET 6) — двоичная куча: `Enqueue` и `Dequeue` за `O(log n)`, `Peek` за `O(1)`. Порядок равных приоритетов **не гарантирован** (нестабильна).
- Перебор `foreach` по `Stack<T>` идёт от вершины, по `Queue<T>` — от головы; элементы при этом не удаляются.
- `LinkedList<T>` — двусвязный список: вставка и удаление узла `O(1)`, но нет доступа по индексу, а память расходуется на узлы и плохо ложится на кэш процессора. Обычно `List<T>` быстрее даже для вставок.
- Для многопоточных очередей — `ConcurrentQueue<T>`, `Channel<T>` ([конкурентные коллекции](#/ref/e/co-concurrent)).
- Очереди неограниченного размера в продакшене опасны: ограничивайте размер или применяйте обратное давление.
- Поиск минимального/максимального элемента «на лету» — типичное применение кучи (`top-k`, алгоритм Дейкстры).
- Если очередь разделяется между потоками, используйте `ConcurrentQueue<T>` или `Channel<T>`: обычная `Queue<T>` при параллельной записи теряет данные.

## Под капотом {#internals}

`Queue<T>` — кольцевой буфер с индексами головы и хвоста; при заполнении массив удваивается. `Stack<T>` — массив и счётчик. `PriorityQueue` — четвертичная куча в массиве: родитель элемента `i` — `(i - 1) / 4`.

## Сложность {#complexity}

Queue/Stack: `Enqueue/Push/Dequeue/Pop` — `O(1)`. PriorityQueue: `O(log n)` на вставку и извлечение. LinkedList: вставка узла `O(1)`, поиск `O(n)`.

## Версии {#versions}

- .NET 2.0 — `Queue<T>`, `Stack<T>`, `LinkedList<T>`; .NET Core 2.0 — `TryDequeue`/`TryPop`.
- .NET 6 — `PriorityQueue<TElement, TPriority>`.

## Ловушки {#pitfalls}

**Dequeue из пустой очереди и порядок.**

~~~csharp
var q = new Queue<int>();
try { q.Dequeue(); } catch (InvalidOperationException) { Console.WriteLine("пусто"); }
Console.WriteLine(q.TryDequeue(out _));

var s = new Stack<char>("abc");
Console.WriteLine(string.Join("", s));          // от вершины

var pq = new PriorityQueue<string, int>();
pq.Enqueue("низкий", 5); pq.Enqueue("срочно", 1); pq.Enqueue("обычный", 3);
while (pq.TryDequeue(out var item, out var pr)) Console.Write($"{item}({pr}) ");
Console.WriteLine();
~~~
~~~console
пусто
False
cba
срочно(1) обычный(3) низкий(5)
~~~

**Ожидание стабильности `PriorityQueue`.**

**`LinkedList` ради «быстрых вставок»** без профилирования.

**Неограниченный рост очереди** при медленном потребителе.

## Примеры {#examples}

~~~csharp
// обход в ширину по графу
var g = new Dictionary<int, int[]> { [1] = [2, 3], [2] = [4], [3] = [4], [4] = [] };
var seen = new HashSet<int> { 1 };
var q = new Queue<int>(); q.Enqueue(1);
while (q.Count > 0)
{
    int v = q.Dequeue(); Console.Write(v + " ");
    foreach (var n in g[v]) if (seen.Add(n)) q.Enqueue(n);
}
Console.WriteLine();

// проверка скобок стеком
Console.WriteLine(Balanced("([]{})") + " " + Balanced("([)]"));
static bool Balanced(string s)
{
    var st = new Stack<char>();
    foreach (var c in s)
        if ("([{".Contains(c)) st.Push(c);
        else if (st.Count == 0 || "([{".IndexOf(st.Pop()) != ")]}".IndexOf(c)) return false;
    return st.Count == 0;
}
~~~
~~~console
1 2 3 4 
True False
~~~

@@ref id="co-interfaces" cat="E" title="Интерфейсы коллекций" cs="2.0" cx="O(1)" mem="O(1)" tags="IEnumerable ICollection IList IReadOnlyList IReadOnlyCollection IDictionary IReadOnlyDictionary ISet что принимать что возвращать контравариантность" topic="p2-collections,p1-interfaces" related="co-list,co-linq-deferred,cl-abstract-vs-interface,ty-variance" learn="?dotnet/standard/collections/::Коллекции .NET"
Интерфейсы коллекций описывают, что вы умеете делать с последовательностью, не привязывая код к конкретной реализации; выбор интерфейса в сигнатуре — часть дизайна метода.

## Синтаксис {#syntax}

~~~csharp @nocheck
IEnumerable<T>        // только перебор (foreach, LINQ)
IReadOnlyCollection<T>// + Count
IReadOnlyList<T>      // + индексатор this[int]
ICollection<T>        // + Add, Remove, Contains, Clear (изменяемая)
IList<T>              // + индексатор, Insert, RemoveAt
IDictionary<K,V> / IReadOnlyDictionary<K,V> / ISet<T>
~~~

## Семантика {#semantics}

- **Параметры** принимайте по самому узкому интерфейсу, который нужен: достаточно перебора — `IEnumerable<T>`; нужны `Count` и индекс — `IReadOnlyList<T>`. Так метод работает с массивами, списками и ленивыми последовательностями.
- **Возвращаемые значения** отдавайте в виде `IReadOnlyList<T>`/`IReadOnlyCollection<T>`, если вы уже материализовали результат, и `IEnumerable<T>` — если он ленивый. `List<T>` как возвращаемый тип раскрывает внутреннюю изменяемость.
- Иерархия: `IEnumerable<T>` → `ICollection<T>` → `IList<T>`; параллельная: `IEnumerable<T>` → `IReadOnlyCollection<T>` → `IReadOnlyList<T>`. Обратите внимание: `IList<T>` **не** наследуется от `IReadOnlyList<T>`.
- `IEnumerable<T>` ковариантен (`IEnumerable<string>` → `IEnumerable<object>`); `IList<T>` инвариантен ([вариантность](#/ref/b/ty-variance)).
- Приведение «вниз» (`(List<T>)list`) нарушает абстракцию; проверяйте через `is ICollection<T> c` для оптимизации (`Count` без перебора).
- Массив `T[]` реализует `IList<T>`, но `Add` бросает `NotSupportedException`: интерфейс обещает больше, чем даёт массив.
- Интерфейс-свойство `IsReadOnly` у `ICollection<T>` сообщает, что изменять нельзя, но исключения всё равно возможны.
- `IReadOnlyList<T>` — это лишь «окно для чтения»: исходный владелец всё ещё может менять данные. Для настоящей неизменяемости используйте `ImmutableArray<T>`, `FrozenSet<T>`, `ReadOnlyCollection<T>` над копией.
- Метод, возвращающий `IEnumerable<T>`, не обязывает вызывающего перечислять один раз; не возвращайте один и тот же перечислитель.

## Под капотом {#internals}

Вызов через интерфейс — виртуальный; перечисление `IEnumerable<T>` создаёт объект-перечислитель (в `List<T>` собственная структура используется только при вызове через конкретный тип). LINQ проверяет, реализует ли источник `ICollection<T>`/`IList<T>`, и берёт `Count` без перебора.

## Сложность {#complexity}

Сами интерфейсы стоимости не добавляют, кроме виртуального вызова. Стоимость операций определяется реализацией.

## Версии {#versions}

- .NET 2.0 — обобщённые интерфейсы коллекций; .NET 4.5 — `IReadOnlyList<T>`, `IReadOnlyDictionary<K,V>`.
- .NET 5 — `IReadOnlySet<T>`; C# 12 — выражения коллекций для интерфейсов.

## Ловушки {#pitfalls}

**Метод принимает `List<T>` и ломает вызывающего.**

~~~csharp
int[] arr = { 3, 1, 2 };
Console.WriteLine(Sum(arr));
Console.WriteLine(Sum(new List<int> { 4, 5 }));
Console.WriteLine(Sum(Enumerable.Range(1, 4)));

IList<int> viaArray = arr;
try { viaArray.Add(1); } catch (NotSupportedException) { Console.WriteLine("массив нельзя расширить"); }

static int Sum(IEnumerable<int> xs) { int s = 0; foreach (var x in xs) s += x; return s; }
~~~
~~~console
6
9
10
массив нельзя расширить
~~~

**Возврат `List<T>` из свойства** позволяет изменить внутреннее состояние снаружи.

**Двойной перебор `IEnumerable`** повторяет запрос.

**Привязка к `IList<T>`** там, где достаточно `IReadOnlyList<T>`.

## Примеры {#examples}

~~~csharp
IReadOnlyList<string> names = new List<string> { "a", "b", "c" };
Console.WriteLine(names[1] + " " + names.Count);

IEnumerable<object> objs = new List<string> { "x", "y" };
Console.WriteLine(objs.Count());

var shop = new Shop();
Console.WriteLine(string.Join(",", shop.Items));
class Shop
{
    private readonly List<string> _items = new() { "хлеб", "молоко" };
    public IReadOnlyList<string> Items => _items;
}
~~~
~~~console
b 3
2
хлеб,молоко
~~~

@@ref id="co-complexity" cat="E" title="Сложность операций коллекций" cs="2.0" cx="таблица" mem="O(n)" tags="сложность Big-O коллекции таблица List Dictionary HashSet SortedDictionary LinkedList Queue Stack доступ вставка поиск удаление выбор коллекции" topic="p2-bigo,p2-collections" related="co-list,co-dictionary,co-hashset,co-queue-stack" learn="dotnet/standard/collections/selecting-a-collection-class::Выбор класса коллекции" table="1"
Выбор коллекции — это выбор сложности операций: одни структуры быстро ищут, другие быстро вставляют, третьи экономят память. Таблица ниже помогает выбрать, не открывая документацию.

## Синтаксис {#syntax}

~~~csharp @nocheck
// Нужен поиск по ключу        → Dictionary<K,V>
// Нужна уникальность          → HashSet<T>
// Нужен порядок и индекс      → List<T>
// Нужен порядок по ключу      → SortedDictionary<K,V> / SortedSet<T>
// Очередь / стек / приоритет  → Queue<T> / Stack<T> / PriorityQueue<T,P>
~~~

## Семантика {#semantics}

- Значения в таблице — типичные оценки для среднего случая; худшие случаи (плохой хеш, рост массива) описаны в соответствующих статьях.
- Асимптотика не учитывает константы: для малых `n` (десятки элементов) линейный поиск по массиву часто быстрее хеш-таблицы из-за кэша процессора.
- `List<T>.Contains` — `O(n)`, а `HashSet<T>.Contains` — `O(1)`: при повторных проверках принадлежности стоит превращать список в множество.
- Сортированные структуры (`SortedDictionary`, `SortedSet`) дают `O(log n)` на операции и упорядоченный перебор, `SortedList` — компактнее, но вставка `O(n)`.
- Вставка в начало `List<T>` — `O(n)`; `LinkedList<T>` — `O(1)`, но с большими константами и без индекса.
- Если порядок вставки важен и нужен быстрый поиск, поддерживайте две структуры или используйте `OrderedDictionary` (.NET 9).
- Фиксированный набор данных после построения лучше превратить в `FrozenDictionary`/`FrozenSet` — чтение быстрее.
- Память: `Dictionary` расходует больше `List<T>` (корзины, записи); `HashSet<int>` — заметно больше, чем `int[]`.
- Измеряйте на реальных данных (BenchmarkDotNet), а не гадайте по таблице.

:::sortable Типичные оценки операций
| Коллекция | Доступ | Поиск | Вставка | Удаление |
|---|---|---|---|---|
| List<T> | O(1) | O(n) | O(1) в конец, O(n) в середину | O(n) |
| Dictionary<K,V> | O(1) | O(1) | O(1) | O(1) |
| HashSet<T> | — | O(1) | O(1) | O(1) |
| SortedDictionary<K,V> | O(log n) | O(log n) | O(log n) | O(log n) |
| SortedSet<T> | — | O(log n) | O(log n) | O(log n) |
| LinkedList<T> | O(n) | O(n) | O(1) | O(1) |
| Queue<T> | — | O(n) | O(1) | O(1) |
| Stack<T> | — | O(n) | O(1) | O(1) |
| PriorityQueue | — | O(n) | O(log n) | O(log n) |
:::

## Под капотом {#internals}

Различие определяется представлением: массив (последовательная память, кэш-дружественно), хеш-таблица (корзины и цепочки), сбалансированное дерево (узлы со ссылками), куча (массив с неявным деревом), связный список (узлы).

## Сложность {#complexity}

См. таблицу выше. Амортизированные оценки учитывают редкий рост массивов; в реальном времени появляются «пики» при росте.

## Версии {#versions}

- .NET 2.0 — основные обобщённые коллекции; .NET 6 — `PriorityQueue`.
- .NET 8 — `FrozenDictionary`/`FrozenSet`; .NET 9 — `OrderedDictionary<K,V>`.

## Ловушки {#pitfalls}

**Поиск в списке в цикле.**

~~~csharp
var ids = Enumerable.Range(0, 5000).ToList();
var wanted = Enumerable.Range(2500, 5000).ToList();

int hitsList = 0;
foreach (var w in wanted) if (ids.Contains(w)) hitsList++;           // ❌ O(n·m)

var set = ids.ToHashSet();
int hitsSet = 0;
foreach (var w in wanted) if (set.Contains(w)) hitsSet++;            // ✅ O(n+m)
Console.WriteLine($"{hitsList} {hitsSet}");
~~~
~~~console
2500 2500
~~~

**Оптимизация по таблице без измерений** на малых объёмах.

**Ожидание `O(1)` от `Dictionary` с плохим хешем.**

**`LinkedList` ради вставок** вместо `List<T>`.

## Примеры {#examples}

~~~csharp
var sw = System.Diagnostics.Stopwatch.StartNew();
var list = Enumerable.Range(0, 20000).ToList();
int n = 0;
for (int i = 0; i < 20000; i++) if (list.Contains(i * 2)) n++;
long tList = sw.ElapsedTicks;
var set = list.ToHashSet();
sw.Restart();
int m = 0;
for (int i = 0; i < 20000; i++) if (set.Contains(i * 2)) m++;
long tSet = sw.ElapsedTicks;
Console.WriteLine($"{n} {m} {tSet < tList}");
~~~
~~~console
10000 10000 True
~~~
