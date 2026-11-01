@@ref id="op-await" cat="A" title="Оператор await" cs="5.0" cx="O(1)" mem="O(1)" danger="1" tags="await async Task ValueTask ConfigureAwait deadlock state machine продолжение синхронизация .Result" topic="p5-async,p5-async-pitfalls" related="op-lambda,op-null-conditional,op-eval-order" learn="dotnet/csharp/language-reference/operators/await::Оператор await"
Оператор `await` приостанавливает выполнение асинхронного метода до завершения операции, **не блокируя поток**, и возвращает её результат или пробрасывает исключение.

## Синтаксис {#syntax}

~~~csharp @nocheck
string text = await client.GetStringAsync(url);
await Task.Delay(100);
var results = await Task.WhenAll(TaskA(), TaskB());
await using var res = new Res();            // асинхронное освобождение
await foreach (var x in stream) { }          // асинхронное перечисление (C# 8)
await task.ConfigureAwait(false);
~~~

## Семантика {#semantics}

- `await` допустим только в методе, лямбде или анонимном методе, помеченном `async` (и, начиная с C# 7.1, в `Main`; с C# 9 — в операторах верхнего уровня).
- Операнд должен быть *ожидаемым* типом: у него есть метод `GetAwaiter()`. Из коробки это `Task`, `Task<T>`, `ValueTask`, `ValueTask<T>`.
- Если задача уже завершена, выполнение продолжается синхронно, без переключения контекста.
- Если задача ещё не завершена, остаток метода становится *продолжением*: метод возвращает управление вызывающему, а продолжение запустится позже — в захваченном `SynchronizationContext` или планировщике задач, либо в потоке пула (при `ConfigureAwait(false)`).
- Исключение, хранящееся в задаче, **перебрасывается** в точке `await` в исходном виде (а не `AggregateException`, как при `.Result`).
- Результат — значение `Task<T>` (`var x = await GetAsync();`) либо ничего для `Task`.
- `await` нельзя использовать внутри `lock` (ошибка CS1996) и в `unsafe`-контексте, а до C# 6 — в `catch` и `finally`.
- Приоритет `await` — как у унарных операторов: `await a + b` читается как `(await a) + b`. Для цепочек используйте скобки: `(await GetAsync()).Name`.

## Под капотом {#internals}

Компилятор превращает `async`-метод в конечный автомат (структуру в релизной сборке), хранящую локальные переменные и номер текущего состояния. При достижении `await` проверяется `awaiter.IsCompleted`; если нет, вызывается `awaiter.OnCompleted(MoveNext)` и метод возвращается. После завершения задачи `MoveNext` вызывается снова и автомат продолжает с сохранённого состояния. Результат метода — `Task`, а при ошибке в автомате исключение сохраняется в задаче.

## Сложность {#complexity}

Для уже завершённых операций стоимость — несколько наносекунд (проверка `IsCompleted`). При реальном ожидании — аллокация автомата и `Task` (для `ValueTask` и кэшированных задач можно избежать). Лишние `await` в тесных циклах заметны.

## Версии {#versions}

- C# 5.0 — `async`/`await`.
- C# 6 — `await` в `catch` и `finally`.
- C# 7.0 — произвольные возвращаемые типы (`ValueTask<T>`).
- C# 7.1 — `async Main`; C# 8 — `await foreach`, `await using`; C# 9 — `await` в операторах верхнего уровня.

## Ловушки {#pitfalls}

**Блокирующее ожидание вместо `await`.**

~~~csharp
async Task<int> GetAsync() { await Task.Delay(10); return 42; }

int r1 = await GetAsync();             // ✅
Console.WriteLine(r1);
int r2 = GetAsync().Result;            // ❌ блокирует поток; в UI/классическом ASP.NET возможен deadlock
Console.WriteLine(r2);
~~~
~~~console
42
42
~~~

**`async void`.** Исключение не перехватить вызывающим; допустим только для обработчиков событий.

**Забытый `await`.** Вызов `DoAsync();` без `await` запустит задачу «в никуда»: компилятор лишь предупредит (CS4014).

**Последовательные ожидания вместо параллельных.** `await A(); await B();` выполняет операции одну за другой; для параллельности запустите обе и затем `await Task.WhenAll(a, b)`.

## Примеры {#examples}

~~~csharp
static async Task<string> Fetch(string name, int ms)
{
    await Task.Delay(ms);
    return name;
}

var sw = System.Diagnostics.Stopwatch.StartNew();
var t1 = Fetch("a", 200);
var t2 = Fetch("b", 200);
string[] both = await Task.WhenAll(t1, t2);                // параллельно
Console.WriteLine(string.Join(",", both));
Console.WriteLine(sw.ElapsedMilliseconds < 380 ? "параллельно" : "последовательно");

try { await Task.Run(() => throw new InvalidOperationException("ошибка в задаче")); }
catch (InvalidOperationException e) { Console.WriteLine(e.Message); }
~~~
~~~console
a,b
параллельно
ошибка в задаче
~~~

@@ref id="op-with" cat="A" title="Выражение with" cs="9.0" cx="O(размер)" mem="O(размер)" tags="with неизменяемость record struct init копия с изменением Clone non-destructive mutation" topic="p1-types,p1-encapsulation" related="op-new,op-assignment,op-pattern-property" learn="dotnet/csharp/language-reference/operators/with-expression::Выражение with"
Выражение `x with { Свойство = значение }` создаёт копию записи, структуры или анонимного типа, заменяя только перечисленные свойства, и оставляет исходный объект неизменным.

## Синтаксис {#syntax}

~~~csharp @nocheck
var p2 = p1 with { X = 10 };
var moved = point with { X = point.X + 1, Y = 0 };
var copy = person with { };            // точная копия
var a2 = anon with { Count = 5 };      // анонимный тип
~~~

## Семантика {#semantics}

- Работает для `record`, `record struct`, любых `struct` (C# 10) и анонимных типов.
- Сначала создаётся *копия* исходного значения (для класса-записи — через скрытый метод `<Clone>$`, для структуры — копированием), потом применяются инициализаторы.
- Присваиваемые члены должны быть доступными для записи с `init` или `set`.
- Копия **поверхностная**: ссылочные поля указывают на те же объекты. Изменяемая коллекция в записи останется общей.
- Для записей-классов клонирование полиморфно: `with` на переменной типа базовой записи создаст копию фактического производного типа.
- Метод клонирования недоступен для обычных классов: ради `with` нужно сделать тип записью.
- Пользовательский копирующий конструктор записи (`protected Rec(Rec original)`) влияет на результат `with`.
- Выражение `with` — это выражение; его результат можно присвоить, передать, вернуть.
- Порядок инициализаторов — слева направо; повторно присвоить то же свойство в одном `with` нельзя.
- Позиционные свойства записи, объявленные в основном конструкторе, получают `init`-аксессоры автоматически, так что `with` для них работает без дополнительного кода.

## Под капотом {#internals}

Для записи-класса компилятор генерирует виртуальный метод `<Clone>$` и защищённый копирующий конструктор; `x with { A = 1 }` превращается в `var t = x.<Clone>$(); t.A = 1;`. Для структур — копирование значения (`ldobj`/`stobj`) и последующая запись в поля копии.

## Сложность {#complexity}

`O(размер объекта)`: копируются все поля. Для крупных записей и горячих путей считайте аллокации (для классов — новая запись в куче; для структур — только копирование).

## Версии {#versions}

- C# 9 — `with` для записей.
- C# 10 — `with` для структур и анонимных типов; `record struct`.

## Ловушки {#pitfalls}

**Поверхностная копия.**

~~~csharp
var a = new Team("A", new List<string> { "Аня" });
var b = a with { Name = "B" };
b.Members.Add("Борис");                         // ❌ изменили общий список
Console.WriteLine(string.Join(",", a.Members)); // Аня,Борис

record Team(string Name, List<string> Members);
~~~
~~~console
Аня,Борис
~~~

**Не работает для обычных классов.** Потребуется ручной метод копирования или перевод типа в `record`.

**Инварианты.** `with` обходит конструктор: проверки в нём не выполняются (проверки в `init`-аксессорах сработают).

**Позиционная запись с изменяемым списком.** Если нужна настоящая неизменяемость, используйте `ImmutableArray<T>` или `IReadOnlyList<T>` с копированием при создании.

**Изменяемые структуры.** Если оригинал — переменная, `with` не нужен; копия и так создаётся присваиванием.

## Примеры {#examples}

~~~csharp
var p1 = new Point(1, 2);
var p2 = p1 with { X = 10 };
Console.WriteLine(p1);                  // Point { X = 1, Y = 2 }
Console.WriteLine(p2);                  // Point { X = 10, Y = 2 }
Console.WriteLine(p1 == p2);            // False: равенство по значению

Shape s = new Circle(2);
Shape t = s with { Name = "копия" };
Console.WriteLine(t.GetType().Name);    // Circle: клонируется фактический тип

record Point(int X, int Y);
record Shape { public string Name { get; init; } = "фигура"; }
record Circle(double R) : Shape;
~~~
~~~console
Point { X = 1, Y = 2 }
Point { X = 10, Y = 2 }
False
Circle
~~~

@@ref id="op-new" cat="A" title="Оператор new и его формы" cs="1.0" cx="O(1)" mem="O(1)" tags="new target-typed new() инициализатор объекта коллекции массив анонимный тип new[] required init collection expression []" topic="p1-types,p1-encapsulation,p2-list" related="op-default,op-with,op-stackalloc,op-range-index" learn="dotnet/csharp/language-reference/operators/new-operator::Оператор new"
`new` создаёт объект, массив или анонимный тип и вызывает конструктор; в современном C# у него есть краткие формы, где тип выводится из контекста.

## Синтаксис {#syntax}

~~~csharp @nocheck
var p = new Person("Аня");                      // конструктор
Person q = new("Борис");                        // target-typed new (C# 9)
var o = new Person { Name = "Вика", Age = 20 }; // инициализатор объекта
var list = new List<int> { 1, 2, 3 };           // инициализатор коллекции
int[] a = new int[5];  var b = new[] { 1, 2 };  // массивы
var anon = new { X = 1, Y = "a" };              // анонимный тип
List<int> c = [1, 2, 3];                        // коллекционное выражение (C# 12)
var d = new Dictionary<string, int> { ["a"] = 1 };   // инициализатор индексатора
~~~

## Семантика {#semantics}

- `new T(...)` выделяет память (кучу для классов, стек/место переменной для структур) и вызывает конструктор. Для `struct` `new S()` обнуляет поля, если нет явного конструктора.
- **Target-typed `new()`** (C# 9) выводит тип из контекста: `List<int> x = new();`. Нельзя применять с `var` и там, где тип не ясен (в аргументах перегруженных методов).
- Инициализатор объекта `{ A = 1 }` присваивает свойства уже после конструктора; свойства могут быть `init` или `set`. `required` члены (C# 11) обязаны быть заданы.
- Инициализатор коллекции вызывает `Add` для каждого элемента; тип должен реализовывать `IEnumerable` и иметь метод `Add`.
- `new[] { 1, 2 }` выводит тип массива из элементов (best common type); `new[] { 1, 2.0 }` — `double[]`.
- Анонимные типы неизменяемы, имеют сгенерированные `Equals`/`GetHashCode`/`ToString`, живут в пределах метода или сборки.
- Коллекционное выражение `[...]` создаёт массив, `List<T>`, `Span<T>`, `ImmutableArray<T>` и др. в зависимости от целевого типа.
- Модификатор `new` у члена класса (скрытие) — другой смысл слова, см. тему наследования.

## Под капотом {#internals}

Для класса IL: `newobj ctor` — выделение объекта в куче и вызов конструктора; для массива — `newarr`. Для структуры — `initobj` или вызов конструктора на адресе переменной. Инициализатор объекта — обычные присваивания после `newobj`. Для коллекционных выражений компилятор выбирает оптимальный способ создания (например, `List<T>` с известной ёмкостью или `ReadOnlySpan<T>` на статических данных).

## Сложность {#complexity}

`O(1)` на выделение небольшого класса плюс стоимость конструктора, `O(n)` для массива длины `n` (обнуление памяти). Каждый `new` класса даёт давление на GC.

## Версии {#versions}

- C# 1.0 — `new T()`, массивы; C# 3.0 — инициализаторы, анонимные типы, `new[]`.
- C# 9 — target-typed `new()`; C# 11 — `required`.
- C# 12 — коллекционные выражения `[...]`; C# 13 — `params` с коллекциями, `^` в инициализаторах.

## Ловушки {#pitfalls}

**Неизменяемость инициализатора и порядок.**

~~~csharp
var b = new Box { Size = 5 };    // ❌ в конструкторе Size ещё 0: инициализатор срабатывает позже
Console.WriteLine(b.Size);

class Box { public int Size { get; set; } public Box() { Console.WriteLine($"ctor, Size={Size}"); } }
~~~
~~~console
ctor, Size=0
5
~~~

**Аллокация в цикле.** `new List<int>()` на каждой итерации создаёт мусор; выносите или используйте `Clear()`.

**Target-typed `new()` и читаемость.** В `Foo(new())` читатель не видит тип; лучше явное имя.

**Массив массивов и многомерный.** `new int[3][]` создаёт «зубчатый» массив с `null` внутри, `new int[3, 3]` — прямоугольный.

## Примеры {#examples}

~~~csharp
var anon = new { Name = "Аня", Age = 20 };
Console.WriteLine(anon);

List<string> names = new() { "Борис", "Вика" };
Console.WriteLine(names.Count);

var map = new Dictionary<string, int> { ["a"] = 1, ["b"] = 2 };
Console.WriteLine(map["b"]);

int[,] grid = new int[2, 3];
int[][] jagged = new int[2][];
Console.WriteLine($"{grid.Length} {jagged[0] is null}");

int[] arr = [1, 2, 3];
Console.WriteLine(arr.Length);
~~~
~~~console
{ Name = Аня, Age = 20 }
2
2
6 True
3
~~~

@@ref id="op-stackalloc" cat="A" title="Оператор stackalloc" cs="7.2" cx="O(n)" mem="O(n)" danger="1" tags="stackalloc Span стек выделение памяти на стеке StackOverflow ArrayPool ref struct" topic="p2-bigo,p1-types" related="op-new,op-pointers,op-range-index" learn="dotnet/csharp/language-reference/operators/stackalloc::Оператор stackalloc"
`stackalloc` выделяет блок памяти на стеке вызовов; без `unsafe` он возвращает `Span<T>`, поэтому подходит для коротких временных буферов без нагрузки на GC.

## Синтаксис {#syntax}

~~~csharp @nocheck
Span<int> s = stackalloc int[16];
Span<byte> b = stackalloc byte[] { 1, 2, 3 };
Span<char> buf = n <= 256 ? stackalloc char[n] : new char[n];
int* p = stackalloc int[4];        // unsafe
~~~

## Семантика {#semantics}

- Память выделяется в кадре текущего метода и **освобождается при возврате** из него; вернуть такой `Span<T>` наружу нельзя (компилятор запретит).
- Тип элемента — неуправляемый (числа, `char`, `bool`, структуры без ссылок).
- В `unsafe`-коде результат присваивается указателю; без `unsafe` — `Span<T>` (C# 7.2) или `ReadOnlySpan<T>`.
- По умолчанию блок обнуляется. Атрибут `[SkipLocalsInit]` отключает обнуление ради скорости; тогда в буфере может лежать мусор и его нужно очистить самим (`Clear()`).
- Размер выбирайте с запасом: стек потока обычно около 1 МБ; слишком большой `stackalloc` вызывает `StackOverflowException`, который нельзя перехватить.
- Нельзя использовать в `catch` и `finally`, а в цикле каждая итерация выделяет новый блок и память не освобождается до конца метода.
- В C# 8 и новее `stackalloc` допустим внутри выражений, в том числе в ветках `?:`.

## Под капотом {#internals}

Это IL-инструкция `localloc`: сдвиг указателя стека на нужное число байт. Переполнение стека проверяется вручную: JIT при больших блоках добавляет «пробы» страниц, но гарантий защиты нет. `Span<T>` содержит указатель и длину, поэтому безопасен по границам.

## Сложность {#complexity}

Выделение — `O(1)` (сдвиг указателя), обнуление — `O(n)`. Нулевая нагрузка на GC, отличная локальность кэша; но размер ограничен и нужно следить за порогом переключения на кучу.

## Версии {#versions}

- C# 1.0 — `stackalloc` только в `unsafe`; C# 7.2 — `Span<T>`, безопасная форма.
- C# 8 — разрешён во вложенных выражениях; C# 12 — коллекционное выражение для `Span<T>` (`Span<int> s = [1, 2, 3];`) тоже может размещаться на стеке.

## Ловушки {#pitfalls}

**Большой размер и StackOverflow.**

~~~csharp
static long Sum(int n)
{
    Span<int> buf = n <= 128 ? stackalloc int[n] : new int[n];   // ✅ порог: большие — в кучу
    for (int i = 0; i < buf.Length; i++) buf[i] = i;
    long total = 0;
    foreach (var v in buf) total += v;
    return total;
}
Console.WriteLine(Sum(10));
Console.WriteLine(Sum(100_000));    // не падает: ушло в кучу
~~~
~~~console
45
4999950000
~~~

**`stackalloc` в цикле.** Память накапливается, пока не завершится метод.

**Возврат из метода.** Нельзя вернуть `Span<T>`, ссылающийся на стек, — ошибка CS8352.

**Ожидание обнулённой памяти** при `SkipLocalsInit`: блок может содержать мусор, читать до записи нельзя.

**Многопоточность.** Стек принадлежит одному потоку: `Span<T>` на `stackalloc` нельзя передавать в другой поток или захватывать в `async`/лямбду.

## Примеры {#examples}

~~~csharp
Span<byte> bytes = stackalloc byte[4];
bytes[0] = 1; bytes[3] = 4;
Console.WriteLine(string.Join(",", bytes.ToArray()));       // 1,0,0,4

ReadOnlySpan<int> primes = stackalloc int[] { 2, 3, 5, 7 };
Console.WriteLine(primes[^1]);                              // 7

Span<char> text = stackalloc char[5];
"hello".AsSpan().CopyTo(text);
Console.WriteLine(new string(text));                        // hello
~~~
~~~console
1,0,0,4
7
hello
~~~

@@ref id="op-ref-out-in" cat="A" title="Модификаторы ref, out, in и ref-возвращаемые значения" cs="1.0" cx="O(1)" mem="O(1)" tags="ref out in ref return ref local ref readonly передача по ссылке параметры TryParse deconstruct ref struct" topic="p1-methods,p1-boxing" related="op-assignment,op-lambda,op-stackalloc" learn="dotnet/csharp/language-reference/keywords/ref::Ключевое слово ref"
`ref`, `out` и `in` передают аргумент по ссылке, а не копируют его: `ref` — для чтения и записи, `out` — только для записи (метод обязан присвоить), `in` — только для чтения без копирования.

## Синтаксис {#syntax}

~~~csharp @nocheck
void Inc(ref int x) => x++;
bool TryParse(string s, out int value) { ... }
double Length(in Vector3 v) => ...;
ref int Find(int[] a, int i) => ref a[i];     // ref-возврат
ref int slot = ref Find(arr, 2);              // ref-локальная переменная
Inc(ref count);   TryParse("1", out var n);   TryParse("1", out _);
~~~

## Семантика {#semantics}

- **`ref`**: аргумент должен быть инициализирован до вызова, метод может читать и менять переменную вызывающего.
- **`out`**: переменная может быть неинициализирована, метод **обязан** присвоить её до выхода; внутри метода читать её до присвоения нельзя. На месте вызова допустимо объявление: `out var x`, `out int x`, `out _`.
- **`in`**: передаёт ссылку, но метод не может менять параметр. Полезен для больших `readonly struct` (избегаем копирования). Для вызова слово `in` необязательно.
- **`ref readonly`** — ссылка только для чтения: возвращаемые значения и локальные переменные (C# 7.2), параметры (C# 12).
- Перегрузки могут различаться по «обычный/`ref`», но не по `ref` против `out` или `in`: это одна и та же сигнатура на уровне IL.
- Свойства, индексаторы и `readonly`-поля нельзя передать как `ref`/`out`.
- `ref`-возврат позволяет вернуть ссылку на элемент массива или поле: изменение результата меняет оригинал. Нельзя вернуть ссылку на локальную переменную метода.
- У `async`-методов и итераторов не может быть `ref`/`out`/`in`-параметров: ссылка на стек не пережила бы приостановку метода.
- Для типов-значений `ref` избегает копирования, для ссылочных — позволяет заменить саму ссылку: `void Replace(ref List<int> l) => l = new();`.

## Под капотом {#internals}

Параметр передаётся как управляемый указатель (`T&` в IL): вызывающий кладёт адрес переменной, а обращения внутри метода разыменовывают его. Для `in` компилятор может создать временную копию, если передаётся значение, у которого нет адреса. `ref struct` (например, `Span<T>`) может жить только на стеке, потому что хранит такой указатель.

## Сложность {#complexity}

`O(1)`. Для крупных структур (десятки байт и более) `in` и `ref` заметно снижают копирование; для маленьких (до 16 байт) обычная передача по значению обычно быстрее и проще.

## Версии {#versions}

- C# 1.0 — `ref`, `out`.
- C# 7.0 — встроенное объявление `out var`; `ref`-возврат и `ref`-локальные.
- C# 7.2 — `in`, `readonly ref`, `ref struct`; C# 7.3 — переназначение `ref`.
- C# 11 — `ref`-поля в `ref struct`, `scoped`; C# 12 — `ref readonly` параметры.

## Ловушки {#pitfalls}

**Ожидание, что `ref` на ссылочный тип — то же, что без него.**

~~~csharp
static void NoRef(List<int> l) => l = new List<int> { 99 };   // меняет только локальную копию ссылки
static void WithRef(ref List<int> l) => l = new List<int> { 99 };

var list = new List<int> { 1 };
NoRef(list);
Console.WriteLine(list[0]);        // 1
WithRef(ref list);
Console.WriteLine(list[0]);        // 99
~~~
~~~console
1
99
~~~

**`in` и копия.** Для изменяемой структуры `in` может создавать защитную копию при вызове её методов — тогда выигрыша нет; делайте тип `readonly struct`.

**`out` в обработке ошибок.** Не читайте `out`-значение, если метод вернул `false`: оно `default`.

**Висячая ссылка.** `ref`-возврат ссылки на элемент `List<T>` становится недействительным после его роста; не храните такие ссылки.

## Примеры {#examples}

~~~csharp
static void Swap(ref int a, ref int b) => (a, b) = (b, a);
int x = 1, y = 2;
Swap(ref x, ref y);
Console.WriteLine($"{x} {y}");            // 2 1

if (int.TryParse("123", out var n)) Console.WriteLine(n + 1);   // 124
Console.WriteLine(int.TryParse("abc", out _));                 // False

static ref int Max(int[] a)
{
    int best = 0;
    for (int i = 1; i < a.Length; i++) if (a[i] > a[best]) best = i;
    return ref a[best];
}
int[] arr = { 3, 9, 4 };
Max(arr) = 0;                             // обнулили максимальный элемент
Console.WriteLine(string.Join(",", arr)); // 3,0,4
~~~
~~~console
2 1
124
False
3,0,4
~~~
