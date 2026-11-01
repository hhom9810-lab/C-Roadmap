@@ref id="co-equality" cat="E" title="Равенство и хеш-код: Equals, GetHashCode, IEqualityComparer" cs="1.0" cx="O(1)" mem="O(1)" tags="Equals GetHashCode IEqualityComparer HashCode.Combine равенство по значению ссылочное равенство IEquatable operator == ключ словаря контракт" topic="p2-dictionary,p2-collections" related="co-dictionary,co-hashset,cl-records,op-comparison" learn="dotnet/csharp/language-reference/operators/equality-operators::Операторы равенства"
Хеш-таблицы работают, только если `Equals` и `GetHashCode` согласованы: равные объекты обязаны иметь равные хеш-коды. Нарушение контракта приводит к «потерянным» ключам.

## Синтаксис {#syntax}

~~~csharp @nocheck
public sealed class Pt : IEquatable<Pt>
{
    public int X, Y;
    public bool Equals(Pt? o) => o is not null && X == o.X && Y == o.Y;
    public override bool Equals(object? o) => Equals(o as Pt);
    public override int GetHashCode() => HashCode.Combine(X, Y);
}
class CaseInsensitive : IEqualityComparer<string> { ... }
~~~

## Семантика {#semantics}

- По умолчанию для **классов** `Equals` и `==` сравнивают ссылки; для **структур** `Equals` сравнивает поля через рефлексию (медленно) — переопределяйте; для **записей** (`record`) равенство по значению генерируется компилятором.
- Контракт: `a.Equals(b)` ⇒ `a.GetHashCode() == b.GetHashCode()`; обратное неверно (коллизии допустимы). Равенство симметрично, транзитивно, рефлексивно, и `x.Equals(null)` — `false`.
- Хеш-код должен быть **стабильным** на время жизни объекта в коллекции: не вычисляйте его из изменяемых полей, если объект лежит в `HashSet`.
- `HashCode.Combine(a, b, …)` комбинирует поля качественно и рандомизирован для каждого процесса; не сохраняйте такие хеши в файлы или базы.
- Реализуйте `IEquatable<T>`: он избегает упаковки для структур и приведения типов.
- Переопределяя `Equals`, переопределяйте `GetHashCode` (иначе предупреждение CS0659) и, по желанию, операторы `==`/`!=`.
- `IEqualityComparer<T>` позволяет сравнивать по-другому без изменения типа: строки без регистра, объекты по идентификатору, `ReferenceEqualityComparer`.
- LINQ (`Distinct`, `GroupBy`, `Except`, `Contains`) и коллекции принимают компаратор отдельным параметром.
- Сравнение `double` через `==` тоже опасно из-за погрешности; для `NaN` метод `Equals` возвращает `true` для двух NaN, а оператор `==` — `false`.
- В коде приложения чаще всего достаточно записи (`record`) или структуры `record struct`: они уже содержат правильное равенство и хеш. Ручная реализация нужна для классов с особой логикой — например, равенство по идентификатору сущности независимо от остальных полей.

## Под капотом {#internals}

`Dictionary` вычисляет хеш, берёт корзину и сравнивает кандидатов `Equals`. Для `string` хеш рандомизирован; для `int` совпадает со значением. Для структур без переопределения `GetHashCode` использует первое поле — качество плохое.

## Сложность {#complexity}

Вычисление хеша обычно `O(размер ключа)`: для строки пропорционально длине. Плохой хеш превращает поиск в `O(n)`.

## Версии {#versions}

- .NET 1.0 — `Equals`/`GetHashCode`; .NET 2.0 — `IEquatable<T>`, `IEqualityComparer<T>`.
- .NET Core 2.1 — `HashCode.Combine`; C# 9 — записи.

## Ловушки {#pitfalls}

**Изменяемый ключ теряется в словаре.**

~~~csharp
var k = new Key { Id = 1 };
var d = new Dictionary<Key, string> { [k] = "значение" };
k.Id = 2;                                         // ❌ хеш изменился
Console.WriteLine(d.ContainsKey(k));
Console.WriteLine(d.Count);

var a = new Key { Id = 5 }; var b = new Key { Id = 5 };
Console.WriteLine(a.Equals(b) + " " + (a.GetHashCode() == b.GetHashCode()) + " " + (a == b));

class Key
{
    public int Id;
    public override bool Equals(object? o) => o is Key k && k.Id == Id;
    public override int GetHashCode() => Id;
}
~~~
~~~console
False
1
True True False
~~~

**Переопределён `Equals`, но не `GetHashCode`** — словарь не найдёт равный ключ.

**Хеш из изменяемых полей** для объектов в `HashSet`.

**Сравнение через `==` для ссылочных типов** вместо `Equals`.

## Примеры {#examples}

~~~csharp
var set = new HashSet<string>(new LenComparer()) { "аа", "бб", "ввв" };
Console.WriteLine(set.Count);

var people = new[] { new P("Ann", 1), new P("ann", 2) };
Console.WriteLine(people.Distinct(new NameComparer()).Count());

record P(string Name, int Id);
class LenComparer : IEqualityComparer<string>
{
    public bool Equals(string? a, string? b) => a?.Length == b?.Length;
    public int GetHashCode(string s) => s.Length;
}
class NameComparer : IEqualityComparer<P>
{
    public bool Equals(P? a, P? b) => string.Equals(a?.Name, b?.Name, StringComparison.OrdinalIgnoreCase);
    public int GetHashCode(P p) => p.Name.ToLowerInvariant().GetHashCode();
}
~~~
~~~console
2
1
~~~

@@ref id="co-comparison" cat="E" title="Сравнение и сортировка: IComparable, IComparer" cs="1.0" cx="O(n log n)" mem="O(log n)" tags="IComparable IComparer Comparer Sort OrderBy ThenBy CompareTo стабильность сортировки Comparison сортировка по нескольким полям" topic="p2-algorithms,p2-collections" related="co-equality,co-list,co-linq-aggregates,ty-string-compare" learn="dotnet/api/system.icomparable-1::IComparable<T>"
Порядок объектов задаётся интерфейсами `IComparable<T>` (естественный порядок типа) и `IComparer<T>` (внешний порядок); их используют `Sort`, `SortedSet`, `BinarySearch`, `Min`/`Max`.

## Синтаксис {#syntax}

~~~csharp @nocheck
class Ver : IComparable<Ver> { public int CompareTo(Ver? o) => ...; }
list.Sort();                                       // естественный порядок
list.Sort((a, b) => a.Age.CompareTo(b.Age));       // Comparison<T>
list.Sort(Comparer<P>.Create((a, b) => ...));      // IComparer<T>
var r = people.OrderBy(p => p.Age).ThenByDescending(p => p.Name);
~~~

## Семантика {#semantics}

- `CompareTo` возвращает отрицательное число, ноль или положительное: «меньше», «равно», «больше». Знак важен, а не величина.
- Не вычитайте значения для сравнения (`a - b`): возможно переполнение `int`; используйте `a.CompareTo(b)` или `int.CompareTo`.
- `List<T>.Sort` и `Array.Sort` — **нестабильны** (равные элементы могут поменять порядок); `OrderBy`/`ThenBy` в LINQ — **стабильны**.
- Для нескольких критериев: `OrderBy(...).ThenBy(...)`, либо компаратор, который сравнивает по первому полю и при равенстве по следующему.
- Строки сравнивайте явно: `string.Compare(a, b, StringComparison.Ordinal)` или `StringComparer.OrdinalIgnoreCase`, а не культурным сравнением по умолчанию ([сравнение строк](#/ref/b/ty-string-compare)).
- Компаратор должен быть согласован: `Compare(a, b) = -Compare(b, a)`, транзитивность. Нарушение может приводить к исключениям `InvalidOperationException` или неверной сортировке.
- Для типов-значений используйте `IComparable<T>`, чтобы избежать упаковки.
- `Comparer<T>.Default` выбирает реализацию автоматически; `null` считается меньше любого значения.
- Сортировка `n` элементов — `O(n log n)`; для почти отсортированных данных стоит рассмотреть `OrderBy` или сохранение сортированной структуры.
- Для сложных порядков удобно собирать компаратор из частей: `Comparer<P>.Create(...)` или цепочка `OrderBy/ThenBy`. Не изменяйте элементы во время сортировки и не используйте недетерминированные компараторы (случайные числа): `Sort` может зациклиться или бросить исключение.

## Под капотом {#internals}

`Array.Sort` использует интроспективную сортировку (гибрид быстрой, пирамидальной и вставками); для примитивных типов применяются векторные оптимизации. `OrderBy` создаёт массив ключей и выполняет стабильную сортировку по индексам.

## Сложность {#complexity}

`Sort` — `O(n log n)` в среднем и худшем случае (introsort), память `O(log n)`; `OrderBy` — `O(n log n)` и `O(n)` дополнительной памяти.

## Версии {#versions}

- .NET 2.0 — `IComparable<T>`, `Comparison<T>`; .NET 3.5 — `OrderBy/ThenBy`.
- .NET 7 — `Order()` и `OrderDescending()` без селектора.

## Ловушки {#pitfalls}

**Нестабильная сортировка и вычитание.**

~~~csharp
var people = new List<(string Name, int Age)> { ("Анна", 30), ("Боря", 25), ("Вера", 30), ("Гена", 25) };
var stable = people.OrderBy(p => p.Age).Select(p => p.Name);
Console.WriteLine(string.Join(",", stable));                 // ✅ стабильно: равные в исходном порядке

int[] xs = { int.MaxValue, -1 };
Array.Sort(xs, (a, b) => a - b);                              // ❌ переполнение: порядок неверный
Console.WriteLine(string.Join(",", xs));
Array.Sort(xs, (a, b) => a.CompareTo(b));
Console.WriteLine(string.Join(",", xs));
~~~
~~~console
Боря,Гена,Анна,Вера
2147483647,-1
-1,2147483647
~~~

**Сортировка строк по культуре** даёт разный порядок на разных машинах.

**Нетранзитивный компаратор** — непредсказуемый результат.

**Повторная сортировка в цикле** вместо сортированной структуры.

## Примеры {#examples}

~~~csharp
var v = new[] { new Ver(1, 10), new Ver(1, 2), new Ver(0, 9) };
Array.Sort(v);
Console.WriteLine(string.Join(" ", v.Select(x => x.ToString())));

var words = new[] { "ёж", "яблоко", "арбуз", "Арбуз" };
Console.WriteLine(string.Join(" ", words.OrderBy(w => w, StringComparer.OrdinalIgnoreCase)));   // «ё» (U+0451) раньше «а»: порядок кодов, не алфавит
Console.WriteLine(string.Join(" ", new[] { 5, 3, 9 }.OrderDescending()));

record Ver(int Major, int Minor) : IComparable<Ver>
{
    public int CompareTo(Ver? o) => o is null ? 1 : Major != o.Major ? Major.CompareTo(o.Major) : Minor.CompareTo(o.Minor);
    public override string ToString() => $"{Major}.{Minor}";
}
~~~
~~~console
0.9 1.2 1.10
ёж арбуз Арбуз яблоко
9 5 3
~~~

@@ref id="co-immutable-frozen" cat="E" title="Неизменяемые и замороженные коллекции" cs="4.5" cx="O(1)–O(log n)" mem="O(n)" tags="ImmutableArray ImmutableList ImmutableDictionary FrozenDictionary FrozenSet ReadOnlyCollection AsReadOnly неизменяемость потокобезопасность System.Collections.Immutable" topic="p2-collections" related="co-interfaces,co-dictionary,co-concurrent,cl-records" learn="?dotnet/standard/collections/::Коллекции .NET"
Неизменяемая коллекция после создания не меняется: любые «изменения» возвращают новую коллекцию. Замороженная (`Frozen*`) — оптимизирована для частого чтения после однократного построения.

## Синтаксис {#syntax}

~~~csharp @nocheck
var a = ImmutableArray.Create(1, 2, 3);          // using System.Collections.Immutable;
var b = a.Add(4);                                 // новый массив, a не изменился
var d = ImmutableDictionary<string, int>.Empty.Add("x", 1);
var f = items.ToFrozenDictionary(i => i.Id);      // using System.Collections.Frozen;
var s = new[] { 1, 2 }.ToFrozenSet();
IReadOnlyList<int> ro = list.AsReadOnly();        // оболочка над списком
~~~

## Семантика {#semantics}

- **`ReadOnlyCollection<T>` / `AsReadOnly()`** — только оболочка: если исходный список изменить, оболочка «увидит» изменения. Это защита от записи через ссылку, а не неизменяемость.
- **`ImmutableArray<T>`** — структура-обёртка над массивом; `Add` копирует массив целиком (`O(n)`), чтение `O(1)`. Подходит, когда изменений мало.
- **`ImmutableList<T>`, `ImmutableDictionary<,>`, `ImmutableHashSet<T>`** — на основе сбалансированных деревьев с разделением структуры: изменение — `O(log n)` и не копирует всё; чтение медленнее массива.
- `Builder` (`ToBuilder()`) позволяет накопить много изменений эффективно, а затем получить итоговую неизменяемую коллекцию.
- **`FrozenDictionary`/`FrozenSet` (.NET 8)** создаются дольше, но поиск быстрее обычного `Dictionary`; идеальны для конфигурации, справочников, загружаемых один раз.
- Неизменяемые коллекции потокобезопасны для чтения без блокировок; удобны для передачи между потоками и для кэша «снимков».
- Не путайте `readonly` поле (ссылка неизменна) с неизменяемым содержимым.
- Для публичных API возвращайте `IReadOnlyList<T>` над копией или `ImmutableArray<T>`.
- Структура `ImmutableArray<T>` по умолчанию (`default`) «не инициализирована»: обращение вызывает `NullReferenceException`/`InvalidOperationException`; проверяйте `IsDefault`.
- Выбор прост: нужен снимок, который нельзя испортить, — `ImmutableArray`; нужно частое «изменение с сохранением старой версии» — `ImmutableList/Dictionary`; нужен самый быстрый поиск по неизменному справочнику — `FrozenDictionary`; нужна только защита публичного API — `AsReadOnly` или `IReadOnlyList<T>` над копией.

## Под капотом {#internals}

`ImmutableList` и `ImmutableDictionary` — AVL-деревья; новая версия делит большинство узлов со старой. `FrozenDictionary` при построении выбирает стратегию (например, перебор для малых размеров или специализированный хеш для строк) под конкретный набор ключей.

## Сложность {#complexity}

`ImmutableArray`: чтение `O(1)`, `Add` `O(n)`. `ImmutableList`/`Dictionary`: `O(log n)`. `Frozen*`: создание дороже, чтение — самое быстрое среди хеш-коллекций.

## Версии {#versions}

- .NET 4.5 — `ReadOnlyCollection<T>`/`IReadOnly*`; пакет `System.Collections.Immutable` — .NET Core 1.0 и далее.
- .NET 8 — `FrozenDictionary`, `FrozenSet`.

## Ловушки {#pitfalls}

**`AsReadOnly` — только оболочка.**

~~~csharp
var src = new List<int> { 1, 2, 3 };
var ro = src.AsReadOnly();
src.Add(4);
Console.WriteLine(ro.Count);                      // 4: оболочка видит изменения

var snap = System.Collections.Immutable.ImmutableArray.CreateRange(src);
src.Add(5);
Console.WriteLine(snap.Length);                   // 4: снимок не меняется
var more = snap.Add(99);
Console.WriteLine($"{snap.Length} {more.Length}");
~~~
~~~console
4
4
4 5
~~~

**Цикл с `Add` на `ImmutableArray`** — квадратичные копирования; используйте `Builder`.

**Принятие `ReadOnlyCollection` за неизменяемую** и гонки данных.

**Замороженные коллекции в горячем пути создания** — построение дороже.

## Примеры {#examples}

~~~csharp
using System.Collections.Frozen;
using System.Collections.Immutable;

var codes = new Dictionary<string, int> { ["RU"] = 7, ["US"] = 1, ["UZ"] = 998 }.ToFrozenDictionary();
Console.WriteLine(codes["UZ"]);

var b = ImmutableArray.CreateBuilder<int>();
for (int i = 0; i < 5; i++) b.Add(i * i);
var arr = b.ToImmutable();
Console.WriteLine(string.Join(",", arr));

var set = new[] { "a", "b", "a" }.ToFrozenSet();
Console.WriteLine(set.Count);
~~~
~~~console
998
0,1,4,9,16
2
~~~

@@ref id="co-concurrent" cat="E" title="Потокобезопасные коллекции" cs="4.0" cx="O(1)" mem="O(n)" tags="ConcurrentDictionary ConcurrentQueue ConcurrentBag BlockingCollection Channel GetOrAdd AddOrUpdate потокобезопасность параллельный доступ producer consumer" topic="p5-concurrency,p2-collections" related="fl-lock,co-dictionary,co-queue-stack,co-immutable-frozen" learn="dotnet/standard/collections/thread-safe/::Потокобезопасные коллекции"
Коллекции из `System.Collections.Concurrent` безопасны при одновременной записи из нескольких потоков, но «составные» операции нужно выполнять их атомарными методами.

## Синтаксис {#syntax}

~~~csharp @nocheck
var d = new ConcurrentDictionary<string, int>();
d.AddOrUpdate("a", 1, (k, old) => old + 1);
int v = d.GetOrAdd("b", k => Compute(k));
d.TryRemove("a", out _);
var q = new ConcurrentQueue<int>();  q.Enqueue(1);  q.TryDequeue(out var x);
var ch = Channel.CreateBounded<int>(100);  await ch.Writer.WriteAsync(1);
~~~

## Семантика {#semantics}

- Обычные `List<T>`, `Dictionary<,>`, `HashSet<T>` при параллельной записи теряют данные или бросают исключения; блокировка либо потокобезопасная коллекция нужны всегда, если хотя бы один поток пишет.
- `ConcurrentDictionary` использует тонкую блокировку по корзинам; `GetOrAdd` и `AddOrUpdate` атомарны для **ключа**, но делегат-фабрика может вызываться несколько раз при гонке, а в словарь попадёт одно значение.
- Шаблон «проверил, затем записал» (`if (!d.ContainsKey(k)) d[k] = …`) всё равно неатомарен — используйте `GetOrAdd`, `TryAdd`.
- `ConcurrentQueue<T>`, `ConcurrentStack<T>` — без блокировок; `ConcurrentBag<T>` — неупорядоченный набор, хорош для пулов объектов.
- `BlockingCollection<T>` блокирует потребителя, пока нет элемента; для асинхронного кода предпочтительнее `Channel<T>`.
- `Channel<T>` (`System.Threading.Channels`) — асинхронная очередь «производитель — потребитель» с ограничением ёмкости и обратным давлением.
- Перебор `ConcurrentDictionary` безопасен, но возвращает снимок, не обязательно актуальный; `Count` и `Keys` блокируют все корзины и дороги.
- Для значений-счётчиков внутри словаря используйте `AddOrUpdate` с чистой функцией либо `Interlocked` по объекту-ячейке.
- Коллекции не заменяют продуманную модель: часто проще иметь неизменяемый снимок и атомарно подменять ссылку.
- Помните и про альтернативу: чаще всего проще делать работу независимой по потокам и объединять результаты в конце (`Parallel.ForEach` с локальными накопителями, `PLINQ`), чем делить одну изменяемую коллекцию между всеми потоками.

## Под капотом {#internals}

`ConcurrentDictionary` хранит корзины с отдельными блокировками (число зависит от `concurrencyLevel`), чтение выполняется без блокировки. `ConcurrentQueue` — связанный список сегментов-массивов с `Interlocked`.

## Сложность {#complexity}

Операции `O(1)` в среднем, но дороже обычных из-за синхронизации (десятки наносекунд без конкуренции).

## Версии {#versions}

- .NET 4.0 — пространство имён `System.Collections.Concurrent`.
- .NET Core 2.1 — `System.Threading.Channels`; .NET 9 — улучшения `GetOrAdd` с аргументом.

## Ловушки {#pitfalls}

**Фабрика `GetOrAdd` может вызваться дважды.**

~~~csharp
var d = new System.Collections.Concurrent.ConcurrentDictionary<int, int>();
int calls = 0;
Parallel.For(0, 1000, _ => d.GetOrAdd(1, k => { Interlocked.Increment(ref calls); return k * 10; }));
Console.WriteLine(d[1]);
Console.WriteLine(calls >= 1);

var counts = new System.Collections.Concurrent.ConcurrentDictionary<string, int>();
Parallel.For(0, 1000, i => counts.AddOrUpdate("k", 1, (_, old) => old + 1));
Console.WriteLine(counts["k"]);
~~~
~~~console
10
True
1000
~~~

**`ContainsKey` + запись** — гонка.

**Побочные эффекты в фабрике** выполнятся несколько раз.

**Использование `Count` в цикле** на горячем пути.

## Примеры {#examples}

~~~csharp
using System.Threading.Channels;

var ch = Channel.CreateUnbounded<int>();
var producer = Task.Run(async () =>
{
    for (int i = 1; i <= 5; i++) await ch.Writer.WriteAsync(i);
    ch.Writer.Complete();
});
int sum = 0;
await foreach (var x in ch.Reader.ReadAllAsync()) sum += x;
await producer;
Console.WriteLine(sum);

var q = new System.Collections.Concurrent.ConcurrentQueue<string>();
q.Enqueue("a"); q.Enqueue("b");
Console.WriteLine(q.TryDequeue(out var first) ? first : "-");
~~~
~~~console
15
a
~~~
