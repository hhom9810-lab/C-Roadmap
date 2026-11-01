@@ref id="rt-weak" cat="G" title="Слабые ссылки и кэши" cs="1.0" cx="O(1)" mem="O(1)" tags="WeakReference WeakReference<T> ConditionalWeakTable GCHandle слабая ссылка кэш MemoryCache утечка событий WeakEventManager TryGetTarget" topic="p1-runtime" related="rt-gc,cl-events-delegates,cl-dispose" learn="dotnet/standard/garbage-collection/weak-references::Слабые ссылки"
Слабая ссылка указывает на объект, но не удерживает его от сборки: если других ссылок нет, объект исчезнет, и `TryGetTarget` вернёт `false`. Это основа кэшей, не мешающих GC.

## Синтаксис {#syntax}

~~~csharp @nocheck
var weak = new WeakReference<BigObject>(obj);
if (weak.TryGetTarget(out var target)) { /* объект ещё жив, держим сильную ссылку target */ }
var table = new ConditionalWeakTable<object, Extra>();   // данные «прикреплены» к объекту
table.Add(key, extra);   table.TryGetValue(key, out var e);
~~~

## Семантика {#semantics}

- Обычная (сильная) ссылка предотвращает сборку объекта; слабая — нет. После сборки `TryGetTarget` возвращает `false`, а старый `WeakReference.Target` — `null`.
- Всегда проверяйте результат и **сразу сохраняйте сильную ссылку** (`target`), иначе объект может исчезнуть между проверкой и использованием.
- Короткая слабая ссылка (по умолчанию) обнуляется при сборке; длинная (`trackResurrection: true`) переживает финализацию — нужна редко.
- Слабая ссылка не гарантирует время жизни: объект может быть собран сразу после того, как исчезла последняя сильная ссылка, а может и жить до следующей сборки.
- **Применение:** кэш «пока есть память» (но для кэша предпочтительнее `MemoryCache` с политикой вытеснения); наблюдатели, которые не должны удерживать подписчиков (слабые события); привязка метаданных к чужим объектам.
- `ConditionalWeakTable<TKey, TValue>` хранит значение, время жизни которого привязано к ключу: пока жив ключ — живо значение; значение не удерживает ключ. Сравнение ключей — по ссылке.
- Классическая утечка: статическое событие или долгоживущий издатель держит подписчиков. Решения — отписка в `Dispose` или слабая подписка.
- Слабые ссылки дороже обычных (дескрипторы GC); не создавайте миллионы.
- Не используйте их для управления ресурсами: для этого `IDisposable`.
- Практический совет: для кэша данных с ограничением по размеру и времени используйте `MemoryCache` или собственную политику вытеснения (LRU), а не слабые ссылки: поведение GC трудно предсказать, и кэш может опустошаться в самый неподходящий момент.

## Под капотом {#internals}

`WeakReference` хранит `GCHandle` типа Weak; сборщик обнуляет дескрипторы мёртвых объектов после пометки. `ConditionalWeakTable` использует «зависимые дескрипторы» (dependent handle), связывающие время жизни значения с ключом.

## Сложность {#complexity}

Создание и проверка — `O(1)`, но с накладными расходами GC-дескрипторов (десятки наносекунд, дополнительная работа сборщика).

## Версии {#versions}

- .NET 1.0 — `WeakReference`; .NET 4.0 — `ConditionalWeakTable`; .NET 4.5 — `WeakReference<T>`.

## Ловушки {#pitfalls}

**Использование цели без проверки и без сильной ссылки.**

~~~csharp
var (weak, strong) = Make();
GC.Collect();
Console.WriteLine(weak.TryGetTarget(out _));        // true — сильная ссылка strong жива
strong = null;
GC.Collect();
Console.WriteLine(weak.TryGetTarget(out _));        // false — объект собран

static (WeakReference<object>, object?) Make() { var o = new object(); return (new WeakReference<object>(o), o); }
~~~
~~~console
True
True
~~~

**Слабая ссылка как «кэш навсегда»:** объект исчезает в любой момент.

**Ожидание немедленной сборки** без `GC.Collect()` в тестах.

**Забытая отписка от события** — утечка, которую слабые ссылки лишь маскируют.

## Примеры {#examples}

~~~csharp
var table = new System.Runtime.CompilerServices.ConditionalWeakTable<object, string>();
var key = new object();
table.Add(key, "метаданные");
Console.WriteLine(table.TryGetValue(key, out var v) ? v : "нет");

var cache = new Dictionary<int, WeakReference<byte[]>>();
var data = new byte[1000];
cache[1] = new WeakReference<byte[]>(data);
Console.WriteLine(cache[1].TryGetTarget(out var got) && got.Length == 1000);
GC.KeepAlive(data); GC.KeepAlive(key);
~~~
~~~console
метаданные
True
~~~

@@ref id="rt-arraypool" cat="G" title="ArrayPool<T>, MemoryPool и переиспользование буферов" cs="7.2" cx="O(1)" mem="O(размер)" tags="ArrayPool Rent Return MemoryPool Memory Span буфер пул объектов ObjectPool переиспользование clearArray StringBuilder cache" topic="p1-runtime" related="rt-loh,rt-allocations,ty-span" learn="dotnet/api/system.buffers.arraypool-1::ArrayPool<T>"
`ArrayPool<T>` выдаёт временные массивы из общего пула и принимает их обратно, избавляя сборщик мусора от множества крупных аллокаций и LOH-давления.

## Синтаксис {#syntax}

~~~csharp @nocheck
var pool = ArrayPool<byte>.Shared;
byte[] buf = pool.Rent(minimumLength: 4096);        // может вернуть массив БОЛЬШЕ запрошенного
try { int n = stream.Read(buf, 0, 4096); Process(buf.AsSpan(0, n)); }
finally { pool.Return(buf, clearArray: true); }
using var owner = MemoryPool<byte>.Shared.Rent(1024);   Memory<byte> m = owner.Memory;
~~~

## Семантика {#semantics}

- `Rent(n)` возвращает массив длиной **не меньше** `n` (размеры округляются до степени двойки); работайте только с нужной частью (`AsSpan(0, n)`), не используйте `buf.Length`.
- Содержимое взятого массива **не обнулено**: там могут лежать данные предыдущего владельца. Не читайте то, что не записали. Для секретов вызывайте `Return(buf, clearArray: true)`.
- После `Return` массив нельзя использовать — другой код получит его немедленно. Не храните ссылку и не возвращайте дважды.
- `ArrayPool<T>.Shared` потокобезопасен и подходит для большинства задач. Для массивов, превышающих максимальный размер пула (≈ 1 ГБ для общего), выделяется новый.
- `MemoryPool<T>` возвращает `IMemoryOwner<T>` с `Memory<T>` — удобно для асинхронных методов, где `Span<T>` неприменим; освобождается через `Dispose`.
- Всегда возвращайте массив в `finally`; пропущенный `Return` — не утечка, но пул теряет эффект (массив будет собран GC).
- Пулы окупаются для буферов от нескольких килобайт и частых операций; для маленьких массивов (десятки байт) `stackalloc` с `Span<T>` быстрее.
- Для переиспользования объектов (не массивов) есть `Microsoft.Extensions.ObjectPool`.
- Перед внедрением пула измерьте аллокации и паузы GC: лишний пул усложняет код и приводит к ошибкам доступа после возврата.
- Типичные места применения — разбор протоколов, чтение файлов и сокетов блоками, сериализация, формирование ответов. В ASP.NET Core пулы буферов уже используются внутри фреймворка (Kestrel, `System.IO.Pipelines`), поэтому вручную они нужны в основном в библиотечном и «горячем» коде.

## Под капотом {#internals}

`SharedArrayPool` хранит по несколько стеков массивов на каждый размер (степень двойки) с локальными кэшами потоков и периодически освобождает неиспользуемые массивы при давлении на память.

## Сложность {#complexity}

`Rent`/`Return` — `O(1)`, десятки наносекунд. Экономия — аллокации и паузы GC, особенно в LOH.

## Версии {#versions}

- .NET Core 1.0 / пакет System.Buffers — `ArrayPool<T>`; .NET Core 2.1 — `Memory<T>`/`MemoryPool<T>`.
- .NET 6+ — улучшения общего пула; C# 7.2 — `Span<T>`.

## Ловушки {#pitfalls}

**Массив длиннее запрошенного и использование после `Return`.**

~~~csharp
var pool = System.Buffers.ArrayPool<int>.Shared;
int[] a = pool.Rent(10);
Console.WriteLine(a.Length >= 10);                  // длина может быть больше (например, 16)
for (int i = 0; i < 10; i++) a[i] = i;
Console.WriteLine(a.AsSpan(0, 10).ToArray().Sum());
pool.Return(a);                                     // дальше a использовать нельзя
~~~
~~~console
True
45
~~~

**Чтение незаписанных данных** из арендованного массива.

**Утечка секретов:** возврат без `clearArray: true`.

**Хранение арендованного массива** в поле объекта.

## Примеры {#examples}

~~~csharp
using System.Buffers;

byte[] buf = ArrayPool<byte>.Shared.Rent(16);
try
{
    "привет"u8.ToArray().AsSpan().CopyTo(buf);
    Console.WriteLine(System.Text.Encoding.UTF8.GetString(buf, 0, 12));
}
finally { ArrayPool<byte>.Shared.Return(buf, clearArray: true); }

using IMemoryOwner<char> owner = MemoryPool<char>.Shared.Rent(8);
owner.Memory.Span[0] = 'ы';
Console.WriteLine(owner.Memory.Span[0]);
~~~
~~~console
привет
ы
~~~

@@ref id="rt-allocations" cat="G" title="Аллокации: как их находить и сокращать" cs="1.0" cx="O(1)" mem="O(размер)" tags="аллокации GC.GetAllocatedBytesForCurrentThread struct class boxing string concat лямбда замыкание LINQ params ValueTask Span stackalloc string.Create StringBuilder профилирование MemoryDiagnoser" topic="p1-runtime,p1-boxing" related="rt-gc,rt-arraypool,ty-boxing,co-linq-perf" learn="dotnet/standard/garbage-collection/performance::Производительность сборки мусора"
Каждая аллокация в куче нагружает сборщик мусора. В горячих участках важно знать, откуда берутся лишние объекты, и убирать их проверенными приёмами — но только после измерения.

## Синтаксис {#syntax}

~~~csharp @nocheck
long before = GC.GetAllocatedBytesForCurrentThread();
Work();
long bytes = GC.GetAllocatedBytesForCurrentThread() - before;
[MemoryDiagnoser] public class Bench { [Benchmark] public void Run() { ... } }   // BenchmarkDotNet
~~~

## Семантика {#semantics}

- **Источники аллокаций:** `new` ссылочных типов; упаковка значений; склейка строк (`+` в цикле); LINQ (итераторы, делегаты); лямбды с захватом (объект замыкания); `params`-массивы; `async`-методы с реальным ожиданием; `ToList()`/`ToArray()`; `string.Split`/`Substring`; форматирование.
- **Сокращение:** `StringBuilder`/`string.Create` вместо конкатенации; `Span<T>`/`ReadOnlySpan<char>` вместо `Substring`; `static`-лямбды и методы вместо замыканий; структуры (`readonly struct`) вместо мелких классов; `ArrayPool`; `stackalloc`; `ValueTask`; кэширование неизменяемых объектов; `CollectionsMarshal`, `TryGetValue` без дополнительных копий.
- **Не жертвуйте читаемостью** там, где нагрузка мала. Сначала профилируйте: чаще всего 90 % аллокаций дают два-три места.
- `GC.GetAllocatedBytesForCurrentThread()` — самый простой счётчик для теста: можно написать модульный тест «этот метод не аллоцирует».
- BenchmarkDotNet с `MemoryDiagnoser` показывает байты на операцию и сборки по поколениям; `dotnet-counters`/`dotnet-trace` — в рабочем процессе.
- Преждевременное использование структур вместо классов может увеличить копирование и упаковки: структура должна быть маленькой и неизменяемой.
- Строки неизменяемы: любая модификация создаёт новую строку; для сложных построений — `StringBuilder` с заранее заданной ёмкостью.
- Интернирование строк уменьшает дубликаты, но навсегда удерживает память.
- Для коллекций задавайте начальную ёмкость, чтобы избежать повторных копирований при росте.

## Под капотом {#internals}

Аллокация в gen0 — сдвиг указателя в контексте выделения потока (allocation context), почти бесплатная; стоимость проявляется позже — при сборке (маркировка живых и уплотнение), пропорциональной количеству выживших.

## Сложность {#complexity}

Аллокация коротких объектов дёшева, но суммарный объём определяет частоту сборок gen0; долгоживущие аллокации дороже из-за промоушена в старшие поколения.

## Версии {#versions}

- .NET 1.0 — базовая модель; C# 7.2 — `Span<T>`, `readonly struct`; C# 9 — `static`-лямбды.
- .NET 5–9 — постоянные оптимизации BCL (меньше аллокаций в LINQ, строках, коллекциях).

## Ловушки {#pitfalls}

**Склейка строк в цикле и скрытая упаковка.**

~~~csharp
long Measure(Action a) { long b = GC.GetAllocatedBytesForCurrentThread(); a(); return GC.GetAllocatedBytesForCurrentThread() - b; }

long concat = Measure(() => { string s = ""; for (int i = 0; i < 200; i++) s += "x"; });
long builder = Measure(() => { var sb = new System.Text.StringBuilder(200); for (int i = 0; i < 200; i++) sb.Append('x'); _ = sb.ToString(); });
Console.WriteLine(concat > builder * 10);

object o = 5;
var sink = new object[100];
long boxing = Measure(() => { for (int i = 0; i < 100; i++) sink[i] = i; });          // каждый int упаковывается
var ints = new int[100];
long noBoxing = Measure(() => { for (int i = 0; i < 100; i++) ints[i] = i; });
Console.WriteLine(boxing > noBoxing);
GC.KeepAlive(o);
~~~
~~~console
True
True
~~~

**Оптимизация без измерений** усложняет код без выигрыша.

**Структуры, которые часто упаковываются** (через `object` или интерфейс).

**Захват переменных лямбдой** в горячем цикле — объект на каждую итерацию.

## Примеры {#examples}

~~~csharp
static long Bytes(Action a) { long b = GC.GetAllocatedBytesForCurrentThread(); a(); return GC.GetAllocatedBytesForCurrentThread() - b; }

string text = "a,b,c,d";
long split = Bytes(() => { foreach (var p in text.Split(',')) _ = p.Length; });
long spans = Bytes(() => { foreach (var r in text.AsSpan().Split(',')) _ = r.End.Value - r.Start.Value; });
Console.WriteLine(split > spans);
~~~
~~~console
True
~~~
