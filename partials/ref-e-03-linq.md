@@ref id="co-linq-basics" cat="E" title="LINQ: Where, Select, OrderBy и цепочки запросов" cs="3.0" cx="O(n)" mem="O(1)" tags="LINQ Where Select OrderBy Take Skip Distinct method syntax query syntax from where select запрос цепочка лямбда IEnumerable" topic="p2-linq" related="co-linq-deferred,co-linq-aggregates,fl-iterators,op-lambda" learn="?dotnet/csharp/linq/::LINQ"
LINQ (Language Integrated Query) — набор методов расширения над `IEnumerable<T>` для фильтрации, преобразования и упорядочивания данных в виде читаемых цепочек.

## Синтаксис {#syntax}

~~~csharp @nocheck
var q = people.Where(p => p.Age >= 18)
              .OrderBy(p => p.Name)
              .Select(p => new { p.Name, p.Age })
              .Take(10);
// эквивалентный синтаксис запросов
var q2 = from p in people where p.Age >= 18 orderby p.Name select p.Name;
~~~

## Семантика {#semantics}

- Каждый оператор принимает последовательность и возвращает новую; исходная коллекция не меняется.
- `Where` отбирает, `Select` преобразует (проекция), `OrderBy/ThenBy` упорядочивают (стабильно), `Take/Skip` берут и пропускают, `Distinct` убирает дубликаты, `Reverse` разворачивает.
- Большинство операторов **ленивые**: запрос выполняется только при переборе или вызове «завершающего» метода (`ToList`, `Count`, `First`) ([подробнее](#/ref/e/co-linq-deferred)).
- Порядок операторов важен: `Where` до `Select` и `OrderBy` сокращает работу; `Take` после `OrderBy` — это «первые N по порядку».
- Синтаксис запросов (`from … select`) компилируется в те же вызовы методов; методы удобнее для операторов без аналога (`Take`, `Skip`, `Zip`, `Chunk`).
- Лямбды в LINQ захватывают переменные: изменённая переменная в момент выполнения даст другой результат.
- Для `IQueryable<T>` (EF Core) лямбды превращаются в деревья выражений и в SQL; не все методы C# можно перевести.
- Выберите `ToList()`/`ToArray()`, когда результат нужен несколько раз или чтобы зафиксировать состояние.
- Индексная перегрузка `Select((x, i) => …)` даёт номер элемента.
- Практический совет: читайте цепочку сверху вниз как конвейер и ставьте самые «отсекающие» фильтры раньше. Для запросов с большим числом шагов выносите промежуточные результаты в переменные с понятными именами — отладка и чтение выигрывают.

## Под капотом {#internals}

Каждый оператор — итератор: `Where` создаёт объект-обёртку над источником и фильтрует в `MoveNext`. Для массивов и списков есть специализированные пути (`WhereArrayIterator`, `WhereListIterator`), которые сокращают накладные расходы. Цепочка `Where(...).Select(...)` может быть слита в один итератор.

## Сложность {#complexity}

`Where`, `Select`, `Take` — `O(n)` по числу просмотренных элементов и `O(1)` памяти; `OrderBy` — `O(n log n)` и `O(n)` памяти (буферизует всё).

## Версии {#versions}

- C# 3.0 / .NET 3.5 — LINQ и синтаксис запросов.
- .NET 6 — `Chunk`, `MinBy`/`MaxBy`, `Take(range)`; .NET 7 — `Order`; .NET 9 — `CountBy`, `AggregateBy`, `Index`.

## Ловушки {#pitfalls}

**Порядок операторов меняет результат.**

~~~csharp
var xs = new[] { 5, 3, 8, 1, 9, 2 };
Console.WriteLine(string.Join(",", xs.OrderBy(x => x).Take(3)));      // три наименьших
Console.WriteLine(string.Join(",", xs.Take(3).OrderBy(x => x)));      // отсортировали первые три
Console.WriteLine(string.Join(",", xs.Where(x => x > 2).Select(x => x * 10)));

int limit = 3;
var q = xs.Where(x => x > limit);
limit = 7;                                                            // ❌ запрос ещё не выполнен
Console.WriteLine(string.Join(",", q));
~~~
~~~console
1,2,3
3,5,8
50,30,80,90
8,9
~~~

**Множественный перебор** запроса выполняет его заново.

**Побочные эффекты в `Select`/`Where`** выполняются лениво и повторно.

**Использование LINQ в горячих циклах** создаёт аллокации; для критичных мест — обычный цикл.

## Примеры {#examples}

~~~csharp
var people = new[] { ("Анна", 31), ("Борис", 17), ("Вера", 25), ("Глеб", 40) };
var adults = people.Where(p => p.Item2 >= 18).OrderBy(p => p.Item1).Select(p => $"{p.Item1} ({p.Item2})");
Console.WriteLine(string.Join(", ", adults));

var q = from p in people where p.Item2 > 20 orderby p.Item2 descending select p.Item1;
Console.WriteLine(string.Join(" ", q));
Console.WriteLine(string.Join(" ", Enumerable.Range(1, 10).Where(n => n % 3 == 0)));
~~~
~~~console
Анна (31), Вера (25), Глеб (40)
Глеб Анна Вера
3 6 9
~~~

@@ref id="co-linq-deferred" cat="E" title="Отложенное и немедленное выполнение" cs="3.0" cx="O(n)" mem="O(n) при материализации" danger="1" tags="deferred execution отложенное выполнение ToList ToArray материализация множественное перечисление ленивый запрос захват переменной" topic="p2-linq,p2-iterators" related="co-linq-basics,fl-iterators,co-linq-perf" learn="dotnet/csharp/linq/get-started/introduction-to-linq-queries::Введение в запросы LINQ"
Большинство операторов LINQ только описывают запрос; реальная работа выполняется при переборе результата. Операторы, которые возвращают одно значение или коллекцию, выполняются немедленно.

## Синтаксис {#syntax}

~~~csharp @nocheck
var q = list.Where(x => x > 0);          // ничего не выполнено
var l = q.ToList();                       // выполнено сейчас, результат зафиксирован
int n = q.Count();                        // выполнено сейчас
foreach (var x in q) { ... }             // выполнено при переборе
~~~

## Семантика {#semantics}

- **Отложенные:** `Where`, `Select`, `OrderBy`, `Take`, `Skip`, `Distinct`, `SelectMany`, `GroupBy`, `Concat`, `Zip` и другие операторы-последовательности.
- **Немедленные:** `ToList`, `ToArray`, `ToDictionary`, `ToHashSet`, `Count`, `Sum`, `Min`, `Max`, `Average`, `First`, `Single`, `Any`, `All`, `Contains`, `Aggregate`.
- Отложенный запрос **хранит ссылку на источник и лямбды**: если источник или захваченные переменные изменились до перебора, вы увидите новые значения.
- Каждый перебор отложенного запроса выполняет его заново, включая побочные эффекты (вызовы функций, чтение файла, обращение к базе в EF Core).
- `OrderBy`, `GroupBy`, `Reverse`, `Distinct` при первом запросе элемента буферизуют весь источник, хотя формально остаются отложенными.
- `ToList()` фиксирует снимок: полезно для использования результата несколько раз и для безопасного изменения исходной коллекции в цикле.
- Исключения в лямбдах возникают при переборе, а не при построении запроса.
- Возвращая `IEnumerable<T>` из метода, вы возвращаете «рецепт», а не данные: вызывающий должен понимать это (документируйте).
- В EF Core запрос уходит в базу при переборе или материализации; повторный перебор — повторный SQL-запрос.
- Практическое правило: если результат нужен более одного раза, зависит от изменяемого источника или тянет данные из внешнего ресурса, материализуйте его (`ToList`, `ToArray`) в том месте, где состояние нужно зафиксировать, и сразу закрывайте ресурсы. В остальных случаях лениво — лучше.
- Отладчик показывает ленивый запрос как «результаты не вычислены»; раскройте его вручную или вызовите `ToList()` в окне просмотра, помня о повторном выполнении побочных эффектов.

## Под капотом {#internals}

Операторы — итераторы (конечные автоматы), которые хранят ссылку на предыдущий оператор и свои лямбды. `MoveNext()` по цепочке тянет элементы от источника к потребителю, по одному.

## Сложность {#complexity}

Построение запроса `O(1)`; выполнение `O(n)`. Материализация добавляет `O(n)` памяти, но экономит повторные вычисления.

## Версии {#versions}

- .NET 3.5 — LINQ to Objects; семантика не менялась.
- .NET 9 — новые операторы (`CountBy`, `AggregateBy`) также отложенные/агрегирующие по тем же правилам.

## Ловушки {#pitfalls}

**Запрос видит данные на момент перебора и выполняется повторно.**

~~~csharp
var data = new List<int> { 1, 2, 3 };
int calls = 0;
var q = data.Where(x => { calls++; return x > 1; });
data.Add(4);                                         // источник изменён ДО перебора
Console.WriteLine(string.Join(",", q));              // включит 4
Console.WriteLine(string.Join(",", q));              // второй перебор — заново
Console.WriteLine(calls);                            // 8 вызовов лямбды

var snap = data.Where(x => x > 1).ToList();          // ✅ снимок
data.Add(5);
Console.WriteLine(string.Join(",", snap));
~~~
~~~console
2,3,4
2,3,4
8
2,3,4
~~~

**Исключение приходит позже,** в точке перебора.

**Повторный перебор запроса к базе** — повторный SQL.

**Возврат ленивого запроса, зависящего от закрытого ресурса** (`using` в методе): к моменту перебора ресурса уже нет.

## Примеры {#examples}

~~~csharp
IEnumerable<int> Gen() { for (int i = 1; i <= 3; i++) { Console.WriteLine("генерирую " + i); yield return i; } }

var lazy = Gen().Select(x => x * x);
Console.WriteLine("запрос построен");
var list = lazy.ToList();
Console.WriteLine(string.Join(",", list));
Console.WriteLine(list.Count);
~~~
~~~console
запрос построен
генерирую 1
генерирую 2
генерирую 3
1,4,9
3
~~~

@@ref id="co-linq-shaping" cat="E" title="SelectMany, Zip, Chunk и преобразование форм" cs="3.0" cx="O(n)" mem="O(n)" tags="SelectMany Zip Chunk Concat Append Prepend Aggregate Range Repeat развернуть вложенные коллекции декартово произведение Index" topic="p2-linq" related="co-linq-basics,co-linq-grouping,co-linq-aggregates" learn="?dotnet/csharp/linq/standard-query-operators/::Стандартные операторы запросов"
Операторы этой группы меняют «форму» данных: разворачивают вложенные последовательности, склеивают, нарезают на части и попарно объединяют.

## Синтаксис {#syntax}

~~~csharp @nocheck
orders.SelectMany(o => o.Lines)                           // плоский список из вложенных
a.Zip(b, (x, y) => x + y);   a.Zip(b);                    // пары (x, y)
xs.Chunk(3);                                              // IEnumerable<int[]>
a.Concat(b);  xs.Append(9);  xs.Prepend(0);
Enumerable.Range(1, 5);  Enumerable.Repeat("x", 3);  Enumerable.Empty<int>();
~~~

## Семантика {#semantics}

- `SelectMany` превращает «последовательность последовательностей» в одну плоскую; вторая перегрузка принимает результирующий селектор и даёт пары «родитель — потомок».
- `from a in A from b in B select …` — синтаксис запросов для `SelectMany`; так строится декартово произведение.
- `Zip` останавливается на более короткой последовательности; перегрузка без селектора возвращает кортежи `(First, Second)` (с .NET 6).
- `Chunk(n)` разбивает на массивы по `n` элементов; последний может быть короче. Удобно для пакетной обработки.
- `Concat` склеивает без удаления дубликатов (в отличие от `Union`); `Append`/`Prepend` добавляют один элемент.
- `Range` и `Repeat` создают последовательности без выделения исходной коллекции (ленивые).
- `Aggregate` сворачивает последовательность в одно значение с накопителем; для типичных случаев есть готовые `Sum`, `Count`, `Min`.
- `DefaultIfEmpty` превращает пустую последовательность в одну со значением по умолчанию — основа левых соединений.
- `Cast<T>` и `OfType<T>` приводят старые необобщённые коллекции (`IEnumerable`) к обобщённым; `OfType` отбрасывает неподходящие.
- Чаще всего эти операторы нужны в трёх случаях: развернуть вложенные списки (заказы → позиции), склеить два параллельных набора данных (имена и значения) и разбить длинный список на пачки для отправки в сервис или базу.
- Когда нужен индекс вместе с элементом, используйте перегрузку `Select((x, i) => …)` или `Index()` из .NET 9; она избавляет от ручных счётчиков.
- `Cast<T>()` падает на первом неподходящем элементе, а `OfType<T>()` его пропускает — выбирайте по тому, считаете ли вы разнотипные данные ошибкой.

## Под капотом {#internals}

Все эти операторы реализованы итераторами. `SelectMany` держит текущего «родителя» и внутренний перечислитель; `Chunk` накапливает массив нужного размера и выдаёт его.

## Сложность {#complexity}

`O(суммарное число элементов)`; `Zip` — `O(min(n, m))`. Декартово произведение `O(n·m)`.

## Версии {#versions}

- .NET 3.5 — `SelectMany`, `Concat`, `Range`; .NET 4.0 — `Zip`.
- .NET Core 1.0 — `Append`/`Prepend`; .NET 6 — `Chunk`, `Zip` с тремя последовательностями и кортежами.

## Ловушки {#pitfalls}

**`Select` вместо `SelectMany` даёт вложенную коллекцию.**

~~~csharp
var teams = new[] { new Team("A", ["Ann", "Bob"]), new Team("B", ["Cid"]) };
var nested = teams.Select(t => t.Members);
Console.WriteLine(nested.Count());                              // 2 списка
var flat = teams.SelectMany(t => t.Members);
Console.WriteLine(string.Join(",", flat));
Console.WriteLine(string.Join("|", teams.SelectMany(t => t.Members, (t, m) => $"{t.Name}:{m}")));
Console.WriteLine(string.Join(";", Enumerable.Range(1, 7).Chunk(3).Select(c => string.Join(",", c))));

record Team(string Name, string[] Members);
~~~
~~~console
2
Ann,Bob,Cid
A:Ann|A:Bob|B:Cid
1,2,3;4,5,6;7
~~~

**`Zip` обрезает до короткой** последовательности без предупреждения.

**`Concat` не убирает дубликаты** — нужен `Union`.

**Вложенные `SelectMany`** на больших данных дают квадратичный результат.

## Примеры {#examples}

~~~csharp
var names = new[] { "Анна", "Борис", "Вера" };
var ages = new[] { 31, 17, 25, 99 };
foreach (var (n, a) in names.Zip(ages)) Console.WriteLine($"{n}: {a}");

var pairs = from x in new[] { 1, 2 } from y in new[] { "a", "b" } select $"{x}{y}";
Console.WriteLine(string.Join(" ", pairs));
Console.WriteLine(string.Join(",", new[] { 3, 4 }.Prepend(1).Append(9)));
~~~
~~~console
Анна: 31
Борис: 17
Вера: 25
1a 1b 2a 2b
1,3,4,9
~~~

@@ref id="co-linq-grouping" cat="E" title="GroupBy, ToLookup, Join" cs="3.0" cx="O(n)" mem="O(n)" tags="GroupBy ToLookup Join GroupJoin левое соединение Lookup группировка ключ группы ToDictionary CountBy" topic="p2-linq,p3-grouping" related="co-linq-basics,co-dictionary,co-linq-aggregates" learn="dotnet/csharp/linq/standard-query-operators/grouping-data::Группировка данных"
`GroupBy` собирает элементы в группы по ключу, `Join` и `GroupJoin` соединяют две последовательности по ключам — как `GROUP BY` и `JOIN` в SQL, но над объектами в памяти.

## Синтаксис {#syntax}

~~~csharp @nocheck
var g = people.GroupBy(p => p.City);                              // IEnumerable<IGrouping<City, Person>>
var g2 = people.GroupBy(p => p.City, p => p.Name, (k, names) => new { k, N = names.Count() });
var lk = people.ToLookup(p => p.City);                            // немедленный, повторно используемый
var j = orders.Join(customers, o => o.CustId, c => c.Id, (o, c) => new { c.Name, o.Total });
var left = customers.GroupJoin(orders, c => c.Id, o => o.CustId, (c, os) => new { c, os });
~~~

## Семантика {#semantics}

- `GroupBy` возвращает последовательность групп `IGrouping<TKey, T>`: у группы есть `Key` и сама она перечисляется как список элементов. Порядок групп — по первому появлению ключа, порядок внутри группы — исходный.
- `GroupBy` — отложенный; после первого запроса буферизует всё. `ToLookup` — **немедленный** и возвращает `ILookup`, в котором индексатор по несуществующему ключу даёт пустую последовательность.
- Для сопоставления «ключ → значение» один-к-одному используйте `ToDictionary`; при дубликатах ключа он бросает `ArgumentException`.
- `Join` — внутреннее соединение: возвращает только пары с совпадающими ключами; `GroupJoin` — для каждого элемента слева даёт группу совпадений справа (в сочетании с `SelectMany` и `DefaultIfEmpty` — левое внешнее соединение).
- `Join` и `GroupJoin` строят хеш-таблицу по правой последовательности и дальше работают за линейное время — это лучше вложенных циклов `O(n·m)`.
- Для составного ключа используйте кортеж или анонимный тип: `GroupBy(x => new { x.A, x.B })` (сравнение по значению).
- Ключи сравниваются через `EqualityComparer<TKey>.Default`; можно передать свой компаратор.
- Итоговые агрегаты по группе — `g.Count()`, `g.Sum(x => x.Total)`, `g.Max()`.
- В EF Core `GroupBy` транслируется в SQL только для простых случаев (агрегаты); иначе группировка выполняется на клиенте.

## Под капотом {#internals}

`GroupBy` внутри — `Lookup<TKey, T>` на хеш-таблице с цепочками групп, где каждая группа — список элементов. `Join` читает правую последовательность целиком, строит `Lookup` и затем для каждого левого элемента ищет совпадения.

## Сложность {#complexity}

`GroupBy`, `ToLookup`, `Join` — `O(n + m)` по времени и `O(n)` по памяти.

## Версии {#versions}

- .NET 3.5 — `GroupBy`, `Join`, `GroupJoin`, `ToLookup`.
- .NET 9 — `CountBy` и `AggregateBy` для частых агрегирующих группировок.

## Ловушки {#pitfalls}

**Группировка и подсчёт, внутреннее соединение теряет строки.**

~~~csharp
var words = "яблоко арбуз груша банан ананас".Split(' ');
foreach (var g in words.GroupBy(w => w[0]).OrderBy(g => g.Key))
    Console.WriteLine($"{g.Key}: {string.Join(",", g)} ({g.Count()})");

var customers = new[] { (Id: 1, Name: "Анна"), (Id: 2, Name: "Борис") };
var orders = new[] { (CustId: 1, Total: 100), (CustId: 1, Total: 50) };
var inner = customers.Join(orders, c => c.Id, o => o.CustId, (c, o) => c.Name + ":" + o.Total);
Console.WriteLine(string.Join(" ", inner));                                   // Бориса нет
var left = customers.GroupJoin(orders, c => c.Id, o => o.CustId, (c, os) => c.Name + ":" + os.Sum(o => o.Total));
Console.WriteLine(string.Join(" ", left));                                    // есть все
~~~
~~~console
а: арбуз,ананас (2)
б: банан (1)
г: груша (1)
я: яблоко (1)
Анна:100 Анна:50
Анна:150 Борис:0
~~~

**`ToDictionary` при дублирующихся ключах** бросает исключение.

**Повторный перебор групп** выполняет `GroupBy` заново — материализуйте.

**Группировка в EF Core на клиенте** загружает всю таблицу.

## Примеры {#examples}

~~~csharp
var sales = new[] { ("Москва", 100), ("Ташкент", 70), ("Москва", 30), ("Ташкент", 20), ("Самарканд", 5) };
var report = sales.GroupBy(s => s.Item1)
                  .Select(g => new { City = g.Key, Total = g.Sum(s => s.Item2), Count = g.Count() })
                  .OrderByDescending(r => r.Total);
foreach (var r in report) Console.WriteLine($"{r.City}: {r.Total} ({r.Count})");

var lookup = sales.ToLookup(s => s.Item1, s => s.Item2);
Console.WriteLine(lookup["Москва"].Sum() + " " + lookup["нет"].Count());
~~~
~~~console
Москва: 130 (2)
Ташкент: 90 (2)
Самарканд: 5 (1)
130 0
~~~

@@ref id="co-linq-aggregates" cat="E" title="First, Single, Any, Count, Sum и другие завершающие операторы" cs="3.0" cx="O(n)" mem="O(1)" tags="First FirstOrDefault Single SingleOrDefault Any All Count Sum Min Max Average Aggregate MinBy MaxBy ElementAt Last Contains" topic="p2-linq" related="co-linq-basics,co-linq-deferred,co-linq-perf" learn="?dotnet/csharp/linq/standard-query-operators/::Стандартные операторы запросов"
Завершающие операторы вычисляют запрос и возвращают одно значение: элемент, число или логический результат. Выбор между `First`, `Single` и `Any` выражает ожидания о данных.

## Синтаксис {#syntax}

~~~csharp @nocheck
list.First();  list.FirstOrDefault(x => x > 3);  list.Single(x => x.Id == id);
list.Any();  list.Any(x => x < 0);  list.All(x => x > 0);
list.Count();  list.Count(x => x > 3);  list.Sum(x => x.Price);
list.Min();  list.MaxBy(x => x.Age);  list.Average();
list.Aggregate(0, (acc, x) => acc + x);  list.ElementAtOrDefault(5);
~~~

## Семантика {#semantics}

- `First()` бросает `InvalidOperationException`, если элементов нет; `FirstOrDefault()` вернёт `default(T)` (`null`/`0`); в .NET 6+ можно передать своё значение по умолчанию.
- `Single()` требует **ровно одного** элемента: ноль или больше одного — исключение. Используйте, когда дубликат — ошибка данных (поиск по уникальному ключу).
- Для проверки «есть ли что-то» всегда используйте `Any()`, а не `Count() > 0`: `Any` останавливается на первом элементе.
- `Count()` у `List<T>`/массивов берёт `Count` без перебора; у ленивой последовательности проходит всю.
- `Sum`, `Average`, `Min`, `Max` для пустой последовательности: `Sum` даёт 0, `Average/Min/Max` числовых типов бросают исключение (для nullable-типов вернут `null`).
- `Sum` целых чисел использует `checked` и может бросить `OverflowException`; для денег применяйте `decimal`, не `double`.
- `MinBy`/`MaxBy` (.NET 6) возвращают **элемент** с минимальным/максимальным ключом, а не сам ключ.
- `Last`, `ElementAt` без индекса на ленивых источниках перебирают всё.
- `Contains` для `HashSet` быстрый (используйте метод множества), для `List<T>` — линейный.
- Предикат внутри `First`/`Count` эквивалентен `Where(...).First()`, но короче и иногда быстрее.
- Для сумм по `decimal` или `long` используйте перегрузку с селектором: `orders.Sum(o => o.Total)`; она не создаёт промежуточную последовательность. Для сравнения регистронезависимых строк в `Contains` передавайте компаратор.

## Под капотом {#internals}

LINQ проверяет, что источник реализует `IList<T>`/`ICollection<T>`/`IReadOnlyList<T>`, и использует `Count`/индекс без перебора. `Sum` для массивов и списков чисел векторизован в современных версиях .NET.

## Сложность {#complexity}

`First`, `Any` — `O(1)` в лучшем случае, `O(n)` при отсутствии совпадений; `Count` — `O(1)` для коллекций и `O(n)` для ленивых; `Sum/Min/Max` — `O(n)`.

## Версии {#versions}

- .NET 3.5 — базовый набор; .NET 6 — `MinBy`, `MaxBy`, `FirstOrDefault(defaultValue)`, `ElementAt(Index)`.
- .NET 9 — `CountBy`, `AggregateBy`.

## Ловушки {#pitfalls}

**`Count() > 0`, `First` на пустом и `Single` на дубликатах.**

~~~csharp
var empty = new List<int>();
try { empty.First(); } catch (InvalidOperationException) { Console.WriteLine("First: пусто"); }
Console.WriteLine(empty.FirstOrDefault(-1));
Console.WriteLine(empty.Sum());
try { empty.Max(); } catch (InvalidOperationException) { Console.WriteLine("Max: пусто"); }

var xs = new[] { 1, 2, 2 };
try { xs.Single(x => x == 2); } catch (InvalidOperationException) { Console.WriteLine("Single: дубликат"); }
Console.WriteLine(xs.Any(x => x > 1) + " " + xs.All(x => x > 1) + " " + xs.Count(x => x == 2));
~~~
~~~console
First: пусто
-1
0
Max: пусто
Single: дубликат
True False 2
~~~

**`Average` пустой последовательности** бросает исключение.

**`Count()` на ленивом запросе ради проверки** выполняет его целиком.

**`Sum` по `int` без учёта переполнения.**

## Примеры {#examples}

~~~csharp
var people = new[] { ("Анна", 31), ("Борис", 17), ("Вера", 25) };
Console.WriteLine(people.MaxBy(p => p.Item2).Item1);
Console.WriteLine(people.Average(p => p.Item2));
Console.WriteLine(people.Sum(p => p.Item2));
Console.WriteLine(people.Aggregate("", (acc, p) => acc + p.Item1[0]));
Console.WriteLine(people.Any(p => p.Item2 < 18));
~~~
~~~console
Анна
24.333333333333332
73
АБВ
True
~~~

@@ref id="co-linq-perf" cat="E" title="LINQ: производительность и типичные ошибки" cs="3.0" cx="O(n)" mem="O(n)" danger="1" tags="LINQ производительность аллокации Count() Any ToList в цикле N+1 IQueryable IEnumerable AsEnumerable делегаты замыкание Distinct порядок операторов" topic="p2-linq,p3-loading" related="co-linq-deferred,co-linq-aggregates,co-complexity,co-interfaces" learn="?dotnet/csharp/linq/::LINQ"
LINQ удобен, но скрывает стоимость: каждая цепочка создаёт итераторы и делегаты, а неудачный порядок операторов или повторный перебор превращает линейный код в квадратичный.

## Синтаксис {#syntax}

~~~csharp @nocheck
// Плохо                                   // Лучше
list.Count() > 0                           // list.Any()
foreach (var id in ids) all.Where(x => x.Id == id)   // словарь: map[id]
q.ToList().Where(...)                      // q.Where(...).ToList()
items.OrderBy(...).First()                 // items.MinBy(...)
~~~

## Семантика {#semantics}

- Запрос в цикле по внешнему списку: `ids.Select(id => all.First(x => x.Id == id))` — `O(n·m)`. Постройте словарь или `ToLookup` один раз.
- `OrderBy(...).First()` сортирует всё ради минимума: используйте `MinBy`/`MaxBy`; для «первых k» — `OrderBy().Take(k)` оптимизирован в частичную сортировку в новых версиях.
- `Where` после `ToList()` фильтрует уже загруженное; фильтр нужно ставить **до** материализации, особенно для `IQueryable`.
- `IQueryable` (EF Core) переводит запрос в SQL; вызов `AsEnumerable()` или `ToList()` переключает обработку в память. Пользовательские методы в `Where` до материализации обычно нельзя перевести в SQL.
- Проблема N+1: цикл по записям с запросом внутри каждой итерации делает N запросов; используйте `Include`, проекцию или один запрос с `Contains`.
- Лямбды, захватывающие переменные, создают объект-замыкание на каждый вызов метода; `static`-лямбды (C# 9) этого избегают.
- Для горячих путей и маленьких коллекций обычный цикл может быть в разы быстрее и не аллоцирует. Но не жертвуйте читаемостью без измерений (BenchmarkDotNet).
- Не вызывайте `Count()` в условии цикла по ленивой последовательности — это перебор на каждой итерации.
- Не смешивайте побочные эффекты с LINQ: запросы должны быть чистыми, действия выполняйте в `foreach`.
- Параллельный LINQ (`AsParallel()`) помогает при тяжёлых вычислениях на больших данных, но дорог для коротких операций и нарушает порядок без `AsOrdered()`.

## Под капотом {#internals}

Цепочки создают объекты-итераторы и делегаты (по одному на оператор и лямбду); виртуальные вызовы `MoveNext` и `Current` на каждый элемент. Специализации внутри LINQ сливают подряд идущие `Where/Select` и используют индексатор для списков и массивов.

## Сложность {#complexity}

Базовая цена оператора — `O(n)` с константой в десятки наносекунд на элемент. Вложенные запросы умножают сложность.

## Версии {#versions}

- .NET 5–8 — многократные оптимизации LINQ (меньше аллокаций, векторизация `Sum`, `Min`, `Max`).
- C# 9 — `static`-лямбды.

## Ловушки {#pitfalls}

**Поиск внутри цикла вместо словаря.**

~~~csharp
var all = Enumerable.Range(0, 3000).Select(i => (Id: i, Name: "n" + i)).ToList();
var ids = Enumerable.Range(0, 3000).ToList();

var sw = System.Diagnostics.Stopwatch.StartNew();
int sumSlow = ids.Sum(id => all.First(x => x.Id == id).Id);             // ❌ O(n²)
long tSlow = sw.ElapsedTicks;

sw.Restart();
var map = all.ToDictionary(x => x.Id);
int sumFast = ids.Sum(id => map[id].Id);                                // ✅ O(n)
long tFast = sw.ElapsedTicks;

Console.WriteLine($"{sumSlow == sumFast} {tFast < tSlow}");
Console.WriteLine(all.Count > 0 ? all.MinBy(x => -x.Id).Id : -1);
~~~
~~~console
True True
2999
~~~

**`ToList()` слишком рано** загружает лишние данные и блокирует трансляцию в SQL.

**Побочные эффекты в `Select`** выполняются повторно.

**`Count()` вместо `Any()`** и `Count` свойства для коллекций.

## Примеры {#examples}

~~~csharp
var data = Enumerable.Range(1, 1_000).ToArray();

int a = data.Where(x => x % 2 == 0).Select(x => x * x).Sum();
int b = 0;
foreach (var x in data) if (x % 2 == 0) b += x * x;                      // то же без LINQ
Console.WriteLine($"{a == b} {a}");

Console.WriteLine(data.AsParallel().Where(x => x % 7 == 0).Count());
~~~
~~~console
True 167167000
142
~~~
