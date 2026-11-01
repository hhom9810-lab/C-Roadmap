@@ref id="rt-stack-heap" cat="G" title="Стек и куча" cs="1.0" cx="O(1)" mem="O(размер)" tags="стек куча heap stack значимые ссылочные локальные переменные stackalloc StackOverflowException escape analysis размещение объектов поле класса структура" topic="p1-runtime,p1-boxing" related="ty-struct,ty-boxing,rt-gc,cl-layout" learn="dotnet/csharp/language-reference/builtin-types/value-types::Значимые типы"
Локальные переменные значимых типов и ссылки лежат в кадре вызова на стеке потока, а экземпляры классов — в управляемой куче, где ими управляет сборщик мусора.

## Синтаксис {#syntax}

~~~csharp @nocheck
int x = 5;                       // значение — на стеке (локальная переменная)
var p = new Point(1, 2);         // struct: значение на стеке или внутри объекта
var c = new Customer();          // class: объект в куче, ссылка c — на стеке
Span<int> s = stackalloc int[16];  // массив на стеке
object o = x;                    // упаковка: копия в куче
~~~

## Семантика {#semantics}

- **Стек** — область памяти потока (обычно 1 МБ; у главного потока может быть больше, зависит от ОС), работает по принципу LIFO: при вызове метода выделяется кадр, при возврате освобождается. Выделение и освобождение мгновенны.
- **Куча** — общая область; объекты создаются `new`, живут, пока на них есть достижимые ссылки, и освобождаются сборщиком мусора.
- Правило «значимые типы — на стеке, ссылочные — в куче» — упрощение. Значимый тип размещается там, где живёт его владелец: поле класса лежит в куче вместе с объектом, элемент массива — внутри массива, захваченная лямбдой переменная — в объекте замыкания.
- Ссылочная переменная (на стеке) хранит адрес объекта в куче; присваивание копирует адрес, а не объект.
- **Упаковка** (`boxing`) создаёт в куче объект-обёртку для значимого типа ([упаковка](#/ref/b/ty-boxing)).
- Глубокая рекурсия переполняет стек (`StackOverflowException`): процесс завершается без возможности перехвата. Ограничивайте глубину или заменяйте рекурсию итерацией со своим стеком.
- `stackalloc` выделяет небольшие буферы на стеке (до нескольких килобайт); результат — `Span<T>`, который нельзя вернуть из метода.
- Среда выполнения (JIT) вправе размещать часть объектов на стеке, если докажет, что они не «убегают» из метода (escape analysis) — доступно в современных версиях .NET (.NET 9/10), поведение не гарантируется.
- Большие структуры (десятки байт) дорого копировать; передавайте по `in`/`ref`.
- Размер стека потока задаётся при создании: `new Thread(work, maxStackSize)`.
- Практический вывод: не думайте «стек быстрее» как универсальное правило. Важнее число аллокаций и размер копий: маленькие неизменяемые структуры (`readonly struct`, до ~16–24 байт) выгодны, большие структуры и частые упаковки — нет.
- Для диагностики используйте профилировщики памяти и счётчики аллокаций: `dotnet-counters` показывает `alloc-rate` и число сборок, а BenchmarkDotNet с `MemoryDiagnoser` — выделенные байты на операцию.

## Под капотом {#internals}

Кадр метода хранит параметры, локальные переменные, адрес возврата и сохранённые регистры. Куча управляется как набор сегментов (регионов) с поколениями; выделение — смещение указателя в текущем регионе (bump allocation) — очень быстро.

## Сложность {#complexity}

Выделение на стеке — `O(1)` и бесплатно по сравнению с кучей; выделение в куче — быстрый сдвиг указателя, но создаёт нагрузку на сборщик мусора и ухудшает локальность кэша.

## Версии {#versions}

- C# 1.0 — стек и куча как основа модели; C# 7.2 — `Span<T>` и безопасный `stackalloc`.
- .NET 9/10 — escape analysis для размещения объектов на стеке (ограниченные случаи, требует проверки в вашем сценарии).

## Ловушки {#pitfalls}

**Структура в поле класса лежит в куче; копия отделяется от оригинала.**

~~~csharp
var h = new Holder { P = new Pt { X = 1 } };
Pt copy = h.P;                  // копия значения
copy.X = 99;
Console.WriteLine(h.P.X);       // 1 — оригинал не изменился

var a = new Cls { X = 1 };
Cls b = a;                      // копия ссылки
b.X = 99;
Console.WriteLine(a.X);         // 99 — тот же объект

Span<int> buf = stackalloc int[4];
buf[0] = 7;
Console.WriteLine(buf[0] + buf.Length);

struct Pt { public int X; }
class Holder { public Pt P; }
class Cls { public int X; }
~~~
~~~console
1
99
11
~~~

**Рекурсия без базового случая** убивает процесс.

**Большой `stackalloc` в цикле** переполняет стек.

**«Всё на стеке» для структур** — неверно: поле класса и элемент массива лежат в куче.

## Примеры {#examples}

~~~csharp
int Depth(int n) => n == 0 ? 0 : 1 + Depth(n - 1);
Console.WriteLine(Depth(5000));          // безопасно: кадров немного

int[] arr = new int[3];                   // массив — ссылочный тип, объект в куче
int[] same = arr;
same[0] = 5;
Console.WriteLine(arr[0]);

int boxedBefore = 1;
object boxed = boxedBefore;               // копия в куче
boxedBefore = 2;
Console.WriteLine((int)boxed);
~~~
~~~console
5000
5
1
~~~

@@ref id="rt-gc" cat="G" title="Сборщик мусора и поколения" cs="1.0" cx="O(живые объекты)" mem="O(n)" danger="1" tags="GC сборщик мусора поколения gen0 gen1 gen2 GC.Collect GC.GetGeneration CollectionCount достижимость корни mark compact утечка памяти Server GC Workstation" topic="p1-runtime" related="rt-stack-heap,rt-loh,rt-weak,cl-dispose" learn="dotnet/standard/garbage-collection/fundamentals::Основы сборки мусора"
Сборщик мусора (GC) автоматически освобождает объекты, до которых нельзя добраться из «корней» (стек, статические поля, регистры). Объекты делятся на поколения, потому что большинство живёт очень недолго.

## Синтаксис {#syntax}

~~~csharp @nocheck
GC.Collect();                       // принудительная сборка (почти всегда не нужна)
int gen = GC.GetGeneration(obj);
int n0 = GC.CollectionCount(0);
long mem = GC.GetTotalMemory(forceFullCollection: false);
GC.GetGCMemoryInfo();   GC.AddMemoryPressure(bytes);
~~~

## Семантика {#semantics}

- Объект «жив», если достижим по ссылкам от корней. Недостижимые объекты, включая циклические ссылки друг на друга, будут собраны — подсчёта ссылок нет.
- **Поколения:** gen0 — новые объекты (маленькая область, собирается часто и быстро); gen1 — пережившие одну сборку (буфер между 0 и 2); gen2 — долгожители, собирается редко и дорого (полная сборка). Объекты не меньше ≈ 85 000 байт попадают в Large Object Heap ([LOH](#/ref/g/rt-loh)).
- Фазы: пометка достижимых объектов (mark), перемещение выживших для уплотнения (compact) и обновление ссылок. Во время фаз потоки приложения приостанавливаются (кроме фоновой сборки gen2).
- **Режимы:** Workstation (по умолчанию для клиентских приложений) и Server (отдельная куча и поток на ядро; выше пропускная способность, больше памяти — для серверов). Конкурентная/фоновая сборка уменьшает паузы gen2.
- `GC.Collect()` обычно вредит: он принудительно запускает полную сборку и сбивает эвристики. Допустим в тестах, диагностике и после разовой загрузки огромных данных.
- Сборщик освобождает **память**, но не внешние ресурсы (файлы, сокеты) — для них `IDisposable` ([Dispose](#/ref/c/cl-dispose)).
- «Утечки памяти» в .NET — это неожиданно достижимые объекты: статические коллекции, неотписанные события, кэши без ограничений, замыкания, `Timer` без `Dispose`.
- Финализируемые объекты переживают первую сборку и освобождаются позже; избегайте финализаторов без необходимости.
- Метрики: частота сборок gen0/gen1/gen2, доля времени в GC (`% Time in GC`), размер кучи — смотрите через `dotnet-counters`.
- Настройки GC задаются в `runtimeconfig.json` или переменных окружения: `System.GC.Server`, `System.GC.Concurrent`, `System.GC.ConserveMemory`. В контейнерах размер кучи ограничивается лимитом памяти контейнера автоматически — учитывайте это при расчёте ресурсов.

## Под капотом {#internals}

Куча состоит из регионов (с .NET 7), распределённых по поколениям. Выделение — сдвиг указателя; при исчерпании gen0 запускается сборка gen0 (с gen1/gen2 по необходимости). Таблица карт (card table) отслеживает ссылки из старших поколений на младшие, чтобы не сканировать всю кучу.

## Сложность {#complexity}

Стоимость сборки пропорциональна числу **живых** объектов в собираемом поколении, а не мусора. Поэтому короткоживущие объекты дёшевы, а долгоживущие, часто пересоздаваемые — дороги.

## Версии {#versions}

- .NET 1.0 — GC с поколениями; .NET 4.5 — фоновая сборка gen2; .NET Core 3.0 — улучшения Server GC.
- .NET 7 — регионы (regions); .NET 5 — `GC.GetGCMemoryInfo` с подробными данными; .NET 8 — `GC.RefreshMemoryLimit`.

## Ловушки {#pitfalls}

**Поколения и принудительная сборка.**

~~~csharp
var o = new object();
Console.WriteLine(GC.GetGeneration(o));            // новый объект — поколение 0
GC.Collect();
Console.WriteLine(GC.GetGeneration(o));            // пережил сборку — поколение 1 или 2
GC.Collect();
Console.WriteLine(GC.GetGeneration(o) >= 1);
int before = GC.CollectionCount(0);
GC.Collect(0);                                     // собираем только поколение 0
Console.WriteLine(GC.CollectionCount(0) - before);   // счётчик вырос на 1
GC.KeepAlive(o);
~~~
~~~console
0
1
True
1
~~~

**Статические коллекции и события** удерживают объекты вечно.

**Вызов `GC.Collect()` «для порядка»** замедляет программу.

**Большое число долгоживущих мелких объектов** — дорогие сборки gen2.

## Примеры {#examples}

~~~csharp
Console.WriteLine(GC.MaxGeneration);
long before = GC.GetAllocatedBytesForCurrentThread();
var arr = new int[1000];
long after = GC.GetAllocatedBytesForCurrentThread();
Console.WriteLine(after - before >= 4000);
GC.KeepAlive(arr);

Console.WriteLine(GC.GetTotalMemory(false) > 0);
~~~
~~~console
2
True
True
~~~

@@ref id="rt-loh" cat="G" title="Large Object Heap и закрепление" cs="1.0" cx="O(1)" mem="O(размер)" tags="LOH Large Object Heap 85000 байт фрагментация LargeObjectHeapCompactionMode GCSettings pinned fixed GCHandle POH закрепление объектов" topic="p1-runtime" related="rt-gc,rt-arraypool,rt-unsafe" learn="dotnet/standard/garbage-collection/large-object-heap::Куча больших объектов"
Объекты размером от ≈ 85 000 байт размещаются в отдельной куче больших объектов (LOH): она собирается вместе с gen2, по умолчанию не уплотняется, и поэтому частые крупные аллокации приводят к давлению на память и фрагментации.

## Синтаксис {#syntax}

~~~csharp @nocheck
var big = new byte[100_000];                     // попадёт в LOH
GCSettings.LargeObjectHeapCompactionMode = GCLargeObjectHeapCompactionMode.CompactOnce;
GC.Collect();
var pinned = GC.AllocateArray<byte>(1024, pinned: true);   // Pinned Object Heap
fixed (byte* p = arr) { ... }
~~~

## Семантика {#semantics}

- Порог — 85 000 байт (≈ 83 КБ). Он относится к размеру всего объекта, включая служебный заголовок массива.
- Объекты LOH считаются поколением 2: `GC.GetGeneration(bigArray)` возвращает 2 сразу после создания.
- LOH собирается только при полной сборке (gen2), поэтому множество временных больших буферов провоцирует дорогие паузы.
- Фрагментация: свободные «дыры» между живыми большими объектами не уплотняются автоматически; можно запросить однократное уплотнение (`CompactOnce`).
- Лечение: переиспользовать буферы (`ArrayPool<T>` — [пул массивов](#/ref/g/rt-arraypool)), обрабатывать данные потоком по частям, не склеивать огромные строки (`StringBuilder`, `Span<T>`).
- Порог можно настроить конфигурацией (`GCLOHThreshold`), но стоит делать это только по результатам измерений.
- **Закрепление** (pinning) запрещает GC перемещать объект: нужно при передаче адреса в неуправляемый код (`fixed`, `GCHandle.Alloc(…, Pinned)`). Закреплённые объекты мешают уплотнению и фрагментируют gen0.
- `GC.AllocateArray<T>(n, pinned: true)` размещает массив в Pinned Object Heap (.NET 5) — подходит для долгоживущих буферов ввода-вывода.
- Строки и списки тоже могут оказаться в LOH: список на миллион элементов растёт удвоением, оставляя старые массивы мусором.

## Под капотом {#internals}

LOH — отдельные сегменты (регионы), выделение через свободные списки (free list), а не сдвиг указателя. Освобождённые блоки переиспользуются под новые большие объекты, подходящие по размеру. POH — отдельная область для закреплённых объектов, которые никогда не перемещаются.

## Сложность {#complexity}

Выделение в LOH дороже, чем в gen0, и требует обнуления памяти (`O(размер)`). Каждый большой объект повышает вероятность полной сборки.

## Версии {#versions}

- .NET 1.0 — LOH; .NET 4.5.1 — `GCLargeObjectHeapCompactionMode`.
- .NET 5 — Pinned Object Heap и `GC.AllocateArray`; .NET 7 — регионы.

## Ловушки {#pitfalls}

**Крупные временные буферы в цикле.**

~~~csharp
var small = new byte[1000];
var big = new byte[100_000];
Console.WriteLine($"{GC.GetGeneration(small)} {GC.GetGeneration(big)}");     // 0 и 2 (LOH)

int g2Before = GC.CollectionCount(2);
for (int i = 0; i < 2000; i++) { var tmp = new byte[100_000]; tmp[0] = 1; }    // ❌ давление на gen2
Console.WriteLine(GC.CollectionCount(2) > g2Before);

var pool = System.Buffers.ArrayPool<byte>.Shared;
int g2Before2 = GC.CollectionCount(2);
for (int i = 0; i < 2000; i++) { var tmp = pool.Rent(100_000); tmp[0] = 1; pool.Return(tmp); }   // ✅ переиспользуем
Console.WriteLine(GC.CollectionCount(2) - g2Before2);
GC.KeepAlive(small);
~~~
~~~console
0 2
True
0
~~~

**Склейка больших строк в цикле** создаёт гигантские временные объекты.

**Долго закреплённые объекты** фрагментируют кучу.

**Настройка порога LOH без измерений.**

## Примеры {#examples}

~~~csharp
int[] a = new int[20_000];           // 80 000 байт: ещё не LOH
int[] b = new int[22_000];           // 88 000 байт: уже LOH
Console.WriteLine(GC.GetGeneration(a) + " " + GC.GetGeneration(b));

var pinned = GC.AllocateArray<byte>(1024, pinned: true);
Console.WriteLine(pinned.Length);
GC.KeepAlive(a); GC.KeepAlive(b);
~~~
~~~console
0 2
1024
~~~
