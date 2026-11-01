@@ref id="rt-clr-jit" cat="G" title="CLR, IL и JIT-компиляция" cs="1.0" cx="O(1)" mem="O(код)" tags="CLR IL MSIL JIT RyuJIT Tiered Compilation PGO ReadyToRun NativeAOT ILSpy метаданные сборка запуск прогрев Roslyn инлайнинг" topic="p1-runtime" related="rt-stack-heap,rt-assemblies,cl-vtable,rt-diagnostics" learn="?dotnet/standard/clr::Common Language Runtime (CLR)"
Код на C# компилируется Roslyn в промежуточный язык (IL) и метаданные в сборку. При запуске CLR загружает сборку, а JIT-компилятор превращает IL в машинный код методов по мере первого вызова.

## Синтаксис {#syntax}

~~~csharp @nocheck
// dotnet build        → IL + метаданные в .dll
// dotnet publish -c Release -r linux-x64 -p:PublishReadyToRun=true
// dotnet publish -p:PublishAot=true            // NativeAOT: машинный код при публикации
[MethodImpl(MethodImplOptions.AggressiveInlining)] int Add(int a, int b) => a + b;
[MethodImpl(MethodImplOptions.NoInlining)] void Cold() { }
~~~

## Семантика {#semantics}

- **IL** — стековый байт-код, одинаковый для всех платформ; он содержит инструкции (`ldarg`, `add`, `call`, `callvirt`, `newobj`), а метаданные описывают типы, методы, поля, атрибуты.
- **JIT (RyuJIT)** компилирует метод при первом вызове в машинный код под текущий процессор (с учётом AVX и др.) и кэширует результат на время жизни процесса.
- **Многоуровневая компиляция (tiered):** сначала быстрый, малооптимизированный код (tier 0); горячие методы (вызваны ≥ 30 раз) перекомпилируются с полной оптимизацией (tier 1). Это ускоряет запуск и даёт пиковую скорость.
- **Динамический PGO** (профилирование по ходу работы, включён по умолчанию с .NET 8) собирает статистику (какие ветки и типы встречаются) и оптимизирует: девиртуализация, раскладка кода, инлайнинг.
- **ReadyToRun (R2R)** — заранее скомпилированный код в сборке: быстрее старт, чуть менее оптимален; горячие методы всё равно перекомпилируются.
- **NativeAOT** компилирует всё в нативный исполняемый файл без JIT: мгновенный старт и малый размер памяти, но ограничения (нет динамической загрузки сборок, ограничена рефлексия и `dynamic`, обрезка неиспользуемого кода).
- **Инлайнинг:** JIT подставляет тела маленьких методов в место вызова, убирая стоимость вызова; `AggressiveInlining` — подсказка, `NoInlining` — запрет.
- Отладочная сборка (`Debug`) отключает оптимизации и продлевает время жизни локальных переменных; замеры производительности — только в `Release`.
- Декомпиляторы (ILSpy, dotPeek) и `sharplab.io` показывают IL и сгенерированный машинный код; полезно, чтобы увидеть конечные автоматы `async`, замыкания, `foreach`.

## Под капотом {#internals}

Первый вызов метода идёт через заглушку (precode/stub), которая вызывает JIT и затем подменяет адрес на скомпилированный код. Таблицы методов (`MethodTable`) и `EEClass` хранят описание типов; загрузчик типов строит их лениво.

## Сложность {#complexity}

Компиляция метода — миллисекунды на сотни методов при старте (поэтому «прогрев» и R2R). После tier-1 производительность близка к нативному коду C++ на вычислительных задачах.

## Версии {#versions}

- .NET Framework 1.0 — CLR и JIT; .NET Core 3.0 — tiered compilation по умолчанию, R2R для платформы.
- .NET 7 — OSR (on-stack replacement) для методов с долгими циклами; .NET 8 — динамический PGO по умолчанию; .NET 7+ — NativeAOT.

## Ловушки {#pitfalls}

**Замеры в Debug и без прогрева.**

~~~csharp
var sw = System.Diagnostics.Stopwatch.StartNew();
long first = Work();
long t1 = sw.ElapsedTicks;                     // первый вызов включает JIT-компиляцию

sw.Restart();
for (int i = 0; i < 50; i++) Work();           // прогрев: метод становится «горячим»
sw.Restart();
Work();
long t2 = sw.ElapsedTicks;
Console.WriteLine(first == Work());
Console.WriteLine(t1 > 0 && t2 > 0);

static long Work() { long s = 0; for (int i = 0; i < 1000; i++) s += i; return s; }
~~~
~~~console
True
True
~~~

**Измерение производительности в Debug** — результаты не показательны.

**NativeAOT и рефлексия:** типы, найденные по строке, могут быть вырезаны при обрезке.

**Ручной `AggressiveInlining` везде** раздувает код.

## Примеры {#examples}

~~~csharp
Console.WriteLine(System.Runtime.InteropServices.RuntimeInformation.FrameworkDescription.StartsWith(".NET"));
Console.WriteLine(System.Runtime.CompilerServices.RuntimeFeature.IsDynamicCodeSupported);
Console.WriteLine(typeof(object).Assembly.GetName().Name);
Console.WriteLine(Environment.Version.Major >= 8);
~~~
~~~console
True
True
System.Private.CoreLib
True
~~~

@@ref id="rt-assemblies" cat="G" title="Сборки, метаданные и рефлексия" cs="1.0" cx="O(1)–O(n)" mem="O(метаданные)" tags="Assembly Type GetType GetMethod Invoke Activator.CreateInstance рефлексия typeof GetCustomAttribute AssemblyLoadContext плагины метаданные BindingFlags кэширование делегатов" topic="p1-runtime" related="cl-attributes,rt-clr-jit,rt-generics-runtime" learn="?dotnet/csharp/advanced-topics/reflection-and-attributes/::Рефлексия и атрибуты"
Сборка (`.dll`/`.exe`) — единица развёртывания и загрузки: код (IL), метаданные и манифест. Рефлексия позволяет читать метаданные и вызывать члены во время выполнения.

## Синтаксис {#syntax}

~~~csharp @nocheck
Type t = typeof(Customer);   Type t2 = obj.GetType();   Type t3 = Type.GetType("Namespace.Name");
MethodInfo m = t.GetMethod("Save", BindingFlags.Public | BindingFlags.Instance)!;
object? r = m.Invoke(obj, new object[] { 5 });
object o = Activator.CreateInstance(t)!;
var attr = t.GetCustomAttribute<TableAttribute>();
Assembly a = Assembly.LoadFrom(path);
~~~

## Семантика {#semantics}

- `Type` описывает тип: имя, члены (`GetMethods`, `GetProperties`, `GetFields`), базовый тип, интерфейсы, атрибуты. Объект `Type` для одного типа единственный.
- Рефлексия позволяет читать и менять закрытые члены, создавать объекты по имени, вызывать методы без знания типа на этапе компиляции — основа сериализаторов, DI-контейнеров, ORM, тестовых фреймворков.
- **Цена:** вызов через `MethodInfo.Invoke` в десятки раз медленнее прямого (проверки, упаковка аргументов); получение членов (`GetMethod`) тоже дорого. Результаты кэшируйте; для горячих путей создавайте делегаты (`CreateDelegate`), деревья выражений (`Expression`) или используйте генераторы исходного кода.
- Рефлексия обходит проверки времени компиляции: опечатка в строке — ошибка во время выполнения. Используйте `nameof` и `typeof`.
- Приватные члены доступны через `BindingFlags.NonPublic`; используйте только в тестах и инфраструктуре.
- **Загрузка сборок:** `AssemblyLoadContext` изолирует плагины и позволяет выгружать их (collectible). Версии зависимостей разрешаются через `deps.json`.
- Имя сборки (`AssemblyName`) включает версию и публичный ключ; в .NET Core строгие имена не влияют на загрузку.
- При обрезке (trimming) и NativeAOT рефлексия по строкам может сломаться: помечайте нужные типы атрибутами `[DynamicallyAccessedMembers]` или применяйте генераторы исходного кода (`System.Text.Json` source generator).
- Безопасность: не создавайте типы по произвольным строкам от пользователя — это уязвимость (десериализация, выполнение чужого кода).

## Под капотом {#internals}

Метаданные хранятся в таблицах (TypeDef, MethodDef, Field, CustomAttribute и др.); рефлексия строит объекты `RuntimeType`, `RuntimeMethodInfo` и кэширует их. `Invoke` проверяет аргументы и использует эмитированный на лету код (в современных версиях — IL-стаб после нескольких вызовов).

## Сложность {#complexity}

`typeof`, `GetType()` — наносекунды; `GetMethod` — сотни наносекунд–микросекунды; `Invoke` — сотни наносекунд против единиц при прямом вызове.

## Версии {#versions}

- .NET 1.0 — рефлексия; .NET Core 1.0 — `AssemblyLoadContext`.
- .NET 5 — генераторы исходного кода (C# 9); .NET 6+ — аннотации для обрезки и AOT (`[DynamicallyAccessedMembers]`).

## Ловушки {#pitfalls}

**Рефлексия медленнее прямого вызова; результат поиска нужно кэшировать.**

~~~csharp
var obj = new Calc();
var m = typeof(Calc).GetMethod(nameof(Calc.Add))!;
Console.WriteLine(m.Invoke(obj, new object[] { 2, 3 }));

var del = (Func<int, int, int>)Delegate.CreateDelegate(typeof(Func<int, int, int>), obj, m);   // ✅ делегат один раз
Console.WriteLine(del(4, 5));

var type = typeof(Calc);
Console.WriteLine(type == obj.GetType() && ReferenceEquals(type, typeof(Calc)));
Console.WriteLine(type.GetProperty("Secret", System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance)!.GetValue(obj));

class Calc
{
    public int Add(int a, int b) => a + b;
    private string Secret => "закрытое значение";
}
~~~
~~~console
5
9
True
закрытое значение
~~~

**Строковые имена членов** ломаются при переименовании — используйте `nameof`.

**Рефлексия в горячем цикле** без кэширования.

**Создание объекта по имени типа из ввода пользователя.**

## Примеры {#examples}

~~~csharp
using System.Reflection;

var t = typeof(List<int>);
Console.WriteLine($"{t.Name} / {t.IsGenericType} / {t.GetGenericArguments()[0].Name}");
Console.WriteLine(typeof(string).GetMethods(BindingFlags.Public | BindingFlags.Instance).Any(m => m.Name == "Trim"));
var o = Activator.CreateInstance(typeof(Point2), 1, 2);
Console.WriteLine(o);
Console.WriteLine(typeof(Point2).GetProperties().Length);

record Point2(int X, int Y);
~~~
~~~console
List`1 / True / Int32
True
Point2 { X = 1, Y = 2 }
2
~~~

@@ref id="rt-generics-runtime" cat="G" title="Обобщения во время выполнения" cs="2.0" cx="O(1)" mem="O(типы)" tags="generics reified обобщения разделяемый код canonical shared generics typeof(List<>) MakeGenericType стирание типов default(T) static в generic" topic="p2-generics,p1-runtime" related="ty-generics,rt-assemblies,ty-boxing" learn="dotnet/csharp/programming-guide/generics/generics-in-the-runtime::Обобщения во время выполнения"
В отличие от стирания типов в Java, обобщения .NET «реальны» (reified): `List<int>` и `List<string>` — разные типы во время выполнения, а JIT генерирует для значимых типов отдельный специализированный код.

## Синтаксис {#syntax}

~~~csharp @nocheck
Type open = typeof(List<>);                         // незакрытый тип
Type closed = open.MakeGenericType(typeof(int));    // List<int>
object o = Activator.CreateInstance(closed)!;
default(T);   typeof(T);   new T();   static T[] _cache;   // в обобщённом классе
~~~

## Семантика {#semantics}

- Каждый **закрытый** обобщённый тип (`List<int>`, `List<string>`, `Dictionary<int, string>`) — отдельный `Type` со своими статическими полями и статическим конструктором.
- Для **значимых** аргументов (`int`, `struct`) JIT создаёт отдельную специализацию кода: нет упаковки, операции над `T` (`+` через `INumber<T>`, сравнение) компилируются в прямые инструкции.
- Для **ссылочных** аргументов (`string`, `object`, `Customer`) используется **один общий код** (`__Canon`), потому что все ссылки одного размера; информация о типе передаётся скрытым параметром.
- Следствие: `typeof(T)`, `default(T)`, `T[]` работают корректно, в отличие от языков со стиранием. Но обобщённые методы над разными ссылочными типами дают один общий код и чуть медленнее для некоторых операций.
- Ограничения (`where T : …`) проверяются компилятором и (для `new()`, `struct`) средой выполнения.
- Статические поля обобщённого класса **не общие** между закрытыми версиями: `Counter<int>.Value` и `Counter<string>.Value` — разные переменные.
- Через рефлексию (`MakeGenericType`, `MakeGenericMethod`) можно создавать закрытые типы во время выполнения; в NativeAOT нужные комбинации должны быть известны заранее.
- Вариантность (`out T`, `in T`) определена только для интерфейсов и делегатов ([вариантность](#/ref/b/ty-variance)).
- `where T : struct` позволяет использовать `T?` как `Nullable<T>`; без ограничения `T?` для ссылочных типов — лишь аннотация.

## Под капотом {#internals}

Для каждого закрытого типа с значимыми параметрами создаётся своя таблица методов и свой машинный код; для ссылочных — общий код с «словарём» (generic dictionary), в котором хранятся дескрипторы типов, нужные при выполнении.

## Сложность {#complexity}

Специализация для значимых типов даёт скорость как у ручного кода без упаковки; общий код для ссылок имеет небольшую накладную стоимость на поиск в словаре. Рост числа закрытых типов увеличивает размер кода и память метаданных.

## Версии {#versions}

- C# 2.0 / .NET 2.0 — обобщения; .NET 4.0 — вариантность; C# 7.3 — ограничения `unmanaged`, `Enum`, `Delegate`.
- C# 11 / .NET 7 — `static abstract` в интерфейсах и обобщённая математика (`INumber<T>`).

## Ловушки {#pitfalls}

**Статические поля не общие, а типы различаются.**

~~~csharp
Counter<int>.Value = 5;
Counter<string>.Value = 7;
Console.WriteLine($"{Counter<int>.Value} {Counter<string>.Value}");
Console.WriteLine(typeof(List<int>) == typeof(List<string>));
Console.WriteLine(typeof(List<>).MakeGenericType(typeof(double)).Name);
Console.WriteLine(Sum(new[] { 1, 2, 3 }) + " " + Sum(new[] { 1.5, 2.5 }));

static T Sum<T>(IEnumerable<T> xs) where T : System.Numerics.INumber<T> => xs.Aggregate(T.Zero, (a, b) => a + b);
class Counter<T> { public static int Value; }
~~~
~~~console
5 7
False
List`1
6 4
~~~

**Ожидание общих статических полей** между `Cache<int>` и `Cache<string>`.

**Рефлексия `MakeGenericType` в AOT** без заранее известных типов.

**Слишком много закрытых комбинаций** раздувает размер кода.

## Примеры {#examples}

~~~csharp
Console.WriteLine(Describe<int>() + " " + Describe<string>() + " " + Describe<List<int>>());
Console.WriteLine(Max(3, 9) + " " + Max("a", "b"));

static string Describe<T>() => $"{typeof(T).Name}:{(typeof(T).IsValueType ? "значение" : "ссылка")}";
static T Max<T>(T a, T b) where T : IComparable<T> => a.CompareTo(b) >= 0 ? a : b;
~~~
~~~console
Int32:значение String:ссылка List`1:ссылка
9 b
~~~

@@ref id="rt-unsafe" cat="G" title="Unsafe-код, указатели и P/Invoke" cs="1.0" cx="O(1)" mem="O(размер)" danger="1" tags="unsafe fixed указатели P/Invoke DllImport LibraryImport Marshal SafeHandle Unsafe.As NativeMemory interop маршалинг StructLayout" topic="p1-runtime" related="op-pointers,rt-loh,ty-span,cl-layout" learn="dotnet/standard/native-interop/pinvoke::Вызов нативного кода (P/Invoke)"
`unsafe` разрешает указатели и работу с памятью напрямую; P/Invoke вызывает функции нативных библиотек. Это нужно для взаимодействия с ОС и высокопроизводительного кода, но обходит защиту типов и границ.

## Синтаксис {#syntax}

~~~csharp @nocheck
unsafe { int x = 5; int* p = &x; *p = 6; }
fixed (byte* p = array) { Native.Fill(p, array.Length); }
[LibraryImport("libc", EntryPoint = "getpid")] static partial int GetPid();
[DllImport("kernel32.dll")] static extern bool Beep(uint freq, uint ms);
byte* mem = (byte*)NativeMemory.Alloc(1024);   NativeMemory.Free(mem);
~~~

## Семантика {#semantics}

- Небезопасный код требует `AllowUnsafeBlocks` в проекте и ключевого слова `unsafe`. Исполняемый код не проверяет границы массивов при работе через указатели — ошибка приводит к повреждению памяти.
- `fixed` закрепляет управляемый объект на время блока, чтобы GC не переместил его ([закрепление](#/ref/g/rt-loh)); адрес действителен только внутри блока.
- В большинстве случаев вместо указателей используйте `Span<T>`, `Memory<T>`, `ref`-локальные и `Unsafe` — безопасно и почти так же быстро ([указатели](#/ref/a/op-pointers)).
- **P/Invoke** сопоставляет managed-сигнатуру с экспортируемой функцией DLL/so. Типы маршалируются: `int` ↔ `int`, строки — по `CharSet`/`StringMarshalling` (UTF-8, UTF-16), структуры — по `StructLayout`.
- `[LibraryImport]` (.NET 7) генерирует маршалинг на этапе компиляции — быстрее и совместимо с AOT; `[DllImport]` — классический вариант с маршалингом во время выполнения.
- Неуправляемые ресурсы (дескрипторы, память) оборачивайте в `SafeHandle` — гарантирует освобождение даже при исключениях и при прерывании.
- Передача управляемых ссылок в нативный код: используйте `fixed`, `GCHandle` (с закреплением) или копирование. Коллбэки в нативный код — делегаты, которые нельзя собирать GC, пока их использует нативная сторона (`GCHandle`/`GC.KeepAlive`).
- Соглашение о вызовах (`StdCall`, `Cdecl`) и выравнивание структур должны совпадать с нативными.
- Ошибки: `Marshal.GetLastWin32Error()` / `SetLastError = true` для получения кода ошибки.
- Кроссплатформенность: имена библиотек и сигнатуры различаются между Windows, Linux и macOS; используйте `NativeLibrary.SetDllImportResolver` или условную компиляцию.

## Под капотом {#internals}

Первый вызов P/Invoke создаёт стаб, который переключает режим потока (cooperative → preemptive), маршалирует аргументы и вызывает нативный адрес. Это десятки наносекунд; поэтому лучше «крупные» вызовы вместо множества мелких.

## Сложность {#complexity}

Вызов P/Invoke — 10–50 нс накладных расходов плюс маршалинг; указатели — без накладных расходов, но с риском.

## Версии {#versions}

- C# 1.0 — `unsafe`, P/Invoke; C# 7.3 — `fixed` для типов с методом `GetPinnableReference`; C# 9 — указатели на функции `delegate*`.
- .NET 6 — `NativeMemory`; .NET 7 — `LibraryImport`; C# 11 — `ref` поля.

## Ловушки {#pitfalls}

**Закреплённая область, выход за границы и освобождение.**

~~~csharp
unsafe
{
    int[] arr = { 1, 2, 3, 4 };
    fixed (int* p = arr)
    {
        for (int i = 0; i < arr.Length; i++) p[i] *= 10;
        Console.WriteLine(*(p + 2));
    }
    Console.WriteLine(string.Join(",", arr));

    byte* mem = (byte*)System.Runtime.InteropServices.NativeMemory.Alloc(4);
    for (int i = 0; i < 4; i++) mem[i] = (byte)(i + 1);
    Console.WriteLine(mem[0] + mem[3]);
    System.Runtime.InteropServices.NativeMemory.Free(mem);
}
~~~
~~~console
30
10,20,30,40
5
~~~

**Выход за границы** через указатель не бросает исключение — портит память.

**Забытое `Free`** для `NativeMemory` — утечка неуправляемой памяти.

**Делегат-коллбэк без удержания** собран GC, пока нативный код его вызывает.

## Примеры {#examples}

~~~csharp
using System.Runtime.InteropServices;
using System.Runtime.CompilerServices;

Console.WriteLine(Marshal.SizeOf<Pair>());
Console.WriteLine(Unsafe.SizeOf<Pair>());
Console.WriteLine(Environment.ProcessId > 0);

Span<byte> bytes = stackalloc byte[4] { 1, 0, 0, 0 };
Console.WriteLine(MemoryMarshal.Read<int>(bytes));

[StructLayout(LayoutKind.Sequential)] struct Pair { public int A; public long B; }
~~~
~~~console
16
16
True
1
~~~

@@ref id="rt-diagnostics" cat="G" title="Диагностика: счётчики, трассировка и профилирование" cs="1.0" cx="O(1)" mem="O(1)" tags="dotnet-counters dotnet-trace dotnet-dump dotnet-gcdump Stopwatch BenchmarkDotNet EventSource ILogger Activity Metrics профилирование утечка памяти дамп памяти" topic="p1-runtime,p5-patterns" related="rt-gc,rt-allocations,rt-clr-jit" learn="?dotnet/core/diagnostics/::Диагностика в .NET"
Прежде чем оптимизировать, нужно измерить: в .NET есть инструменты для наблюдения за работающим процессом (счётчики, трассы, дампы) и библиотека точных микробенчмарков.

## Синтаксис {#syntax}

~~~csharp @nocheck
dotnet-counters monitor --process-id 1234 System.Runtime
dotnet-trace collect --process-id 1234
dotnet-gcdump collect -p 1234        // что занимает память
dotnet-dump collect -p 1234  →  dotnet-dump analyze dump.dmp
[MemoryDiagnoser] public class B { [Benchmark] public int Run() => Compute(); }
var meter = new Meter("app");  var c = meter.CreateCounter<int>("orders");  c.Add(1);
~~~

## Семантика {#semantics}

- **Метрики:** `System.Diagnostics.Metrics` (`Meter`, `Counter<T>`, `Histogram<T>`) — стандарт для измеримых значений; экспортируются в OpenTelemetry, Prometheus; встроенные метрики среды выполнения доступны через `dotnet-counters`.
- **Журналирование:** `ILogger<T>` с уровнями (`Trace`…`Critical`) и структурированными сообщениями (`log.LogInformation("Заказ {Id}", id)`) — параметры не форматируются в строку, если уровень отключён.
- **Трассировка:** `Activity` и `ActivitySource` строят распределённые трассы (OpenTelemetry); `EventSource` — события среды выполнения.
- **Утечки памяти:** сравните два `dotnet-gcdump` с интервалом, посмотрите растущие типы и цепочки к корням; типичные причины — статические коллекции, события, кэши.
- **Профилирование CPU:** `dotnet-trace` + PerfView/Speedscope, Visual Studio Profiler, JetBrains dotTrace; смотрите «горячие» методы, а не угадывайте.
- **Микробенчмарки:** `BenchmarkDotNet` запускает код многократно с прогревом, учитывает JIT и GC, показывает среднее, разброс, аллокации (`MemoryDiagnoser`). `Stopwatch` в одном запуске без прогрева даёт шум.
- `Stopwatch.GetTimestamp()` и `Stopwatch.GetElapsedTime(start)` позволяют измерять интервалы без аллокаций.
- `Debug.Assert`, `Debugger.IsAttached`, условная компиляция `#if DEBUG` помогают в отладке, но не заменяют логи в продакшене.
- В контейнерах и облаке используйте проверки работоспособности (`/health`) и экспорт метрик; логи отправляйте в стандартный вывод.
- Измеряйте нагрузкой, близкой к реальной; микробенчмарк не отражает поведение под конкуренцией и с реальными данными.

## Под капотом {#internals}

Среда выполнения публикует события и счётчики через `EventPipe` — кроссплатформенный буфер в процессе; инструменты подключаются по диагностическому сокету (IPC) и читают поток событий без перезапуска приложения.

## Сложность {#complexity}

Счётчики практически бесплатны; трассировка с высокой детализацией и дампы замедляют процесс и занимают место. В продакшене включайте их точечно.

## Версии {#versions}

- .NET Core 3.0 — `dotnet-counters`, `dotnet-trace`; .NET 6 — `System.Diagnostics.Metrics`.
- .NET 7/8 — `Activity` и метрики по умолчанию в ASP.NET Core.

## Ловушки {#pitfalls}

**Один замер без прогрева и сравнение несопоставимых запусков.**

~~~csharp
static long Run() { long s = 0; for (int i = 0; i < 100_000; i++) s += i % 7; return s; }

var t0 = System.Diagnostics.Stopwatch.GetTimestamp();
Run();
var cold = System.Diagnostics.Stopwatch.GetElapsedTime(t0);

for (int i = 0; i < 100; i++) Run();                        // прогрев
var times = new List<double>();
for (int i = 0; i < 20; i++)
{
    var t = System.Diagnostics.Stopwatch.GetTimestamp();
    Run();
    times.Add(System.Diagnostics.Stopwatch.GetElapsedTime(t).TotalMilliseconds);
}
Console.WriteLine(times.Count + " " + (times.Min() <= times.Max()));
Console.WriteLine(cold.Ticks > 0);
~~~
~~~console
20 True
True
~~~

**Оптимизация по «ощущениям»** без профиля.

**Логирование через интерполяцию строк** на отключённых уровнях тратит время (используйте шаблон с параметрами).

**Дамп памяти с секретами** отправляется в чужие руки.

## Примеры {#examples}

~~~csharp
using System.Diagnostics;
using System.Diagnostics.Metrics;

var meter = new Meter("демо");
var counter = meter.CreateCounter<int>("заказы");
long total = 0;
using var listener = new MeterListener();
listener.InstrumentPublished = (inst, l) => { if (inst.Meter == meter) l.EnableMeasurementEvents(inst); };
listener.SetMeasurementEventCallback<int>((inst, value, tags, state) => total += value);
listener.Start();
counter.Add(2); counter.Add(3);
Console.WriteLine(total);

using var act = new ActivitySource("демо");
Console.WriteLine(act.Name);
~~~
~~~console
5
демо
~~~
