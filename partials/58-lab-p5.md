@@append id="p5-async"
## Закрепление {#lab}

:::viz async await
:::

:::quiz Task и async/await
? Что происходит в точке `await` на незавершённой задаче? #async
+ Метод приостанавливается (его состояние сохраняется в конечном автомате), поток освобождается, а продолжение выполнится после завершения задачи
- Поток блокируется и ждёт
- Создаётся новый поток для ожидания
- Метод завершается с ошибкой
= `await` — не «подожди здесь», а «вернись сюда потом». Поток свободен для других дел.

? Чем `Task.Run` отличается от `async`-метода? #async
+ `Task.Run` отправляет работу в пул потоков (для CPU-bound); `async`/`await` — про ожидание I/O без блокировки потока
- Ничем
- `Task.Run` для I/O
- `async` создаёт поток
= Для сетевых и дисковых операций поток не нужен вообще — там ждёт ОС.

? Что вернёт `Task.WhenAll(t1, t2, t3)`? #async
+ Задачу, которая завершится, когда завершатся все три; результаты — массив
- Результат первой завершившейся
- Исключение
- Ничего
= Первая завершившаяся — это `Task.WhenAny`.

? Какую ошибку скрывает код? #async
| var a = await GetA();
| var b = await GetB();   // GetA и GetB независимы
+ Операции выполняются последовательно, хотя могли бы параллельно: время = A + B вместо max(A, B)
- Блокировка потока
- Утечка памяти
- Дедлок
= Запусти обе задачи, потом `await Task.WhenAll(...)`.
:::

:::ticket Отчёт грузится последовательно
@key PERF-31
@type Improvement
@prio Medium
@reporter Лена (продакт)
@labels async, производительность
@xp 90
@task
`SumAsync` собирает данные по списку id из сервиса, который отвечает ~100 мс. Для 3 id отчёт ждёт 300 мс — запросы идут один за другим.

**Нужно:** запустить запросы **одновременно** (`Task.WhenAll`), сумма остаётся той же. Тест проверяет, сколько запросов было «в полёте» одновременно.
@code
~~~csharp
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

public class Service
{
    public int InFlight;
    public int MaxInFlight;

    public async Task<int> FetchAsync(int id)
    {
        InFlight++;
        if (InFlight > MaxInFlight) MaxInFlight = InFlight;
        await Task.Delay(100);
        InFlight--;
        return id * 10;
    }
}

public static class Solver
{
    public static async Task<int> SumAsync(Service s, int[] ids)
    {
        int total = 0;
        foreach (var id in ids)
            total += await s.FetchAsync(id);
        return total;
    }
}
~~~
@tests
~~~csharp
class T
{
    public static void Run()
    {
        var s = new Service();
        int sum = Solver.SumAsync(s, new[] { 1, 2, 3 }).GetAwaiter().GetResult();
        Assert.Equal(60, sum, "сумма не изменилась");
        Assert.Equal(3, s.MaxInFlight, "три запроса одновременно");
        var s2 = new Service();
        Assert.Equal(0, Solver.SumAsync(s2, new int[0]).GetAwaiter().GetResult(), "пустой список");
    }
}
~~~
@hint
`var tasks = ids.Select(id => s.FetchAsync(id)).ToList();` запускает все задачи сразу (LINQ ленив, поэтому `ToList()` обязателен!), затем `var results = await Task.WhenAll(tasks);`.
@solution
~~~csharp
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

public class Service
{
    public int InFlight;
    public int MaxInFlight;

    public async Task<int> FetchAsync(int id)
    {
        InFlight++;
        if (InFlight > MaxInFlight) MaxInFlight = InFlight;
        await Task.Delay(100);
        InFlight--;
        return id * 10;
    }
}

public static class Solver
{
    public static async Task<int> SumAsync(Service s, int[] ids)
    {
        var tasks = ids.Select(id => s.FetchAsync(id)).ToList();
        var results = await Task.WhenAll(tasks);
        return results.Sum();
    }
}
~~~
@why
Задача начинает выполняться в момент вызова метода, а не в момент `await`. Поэтому «запустить все, потом дождаться всех» даёт параллелизм. Заметь связь с темой LINQ: без `ToList()` запросы стартовали бы по одному — во время перебора внутри `WhenAll`.
:::

:::cards Async
await :: Приостанавливает метод (конечный автомат), освобождает поток, продолжение — после завершения.
Task.Run :: Для CPU-bound работы в пуле потоков; для I/O не нужен.
WhenAll / WhenAny :: Ждать все задачи / первую завершившуюся.
Задача стартует при вызове :: Не при await — отсюда параллелизм «запусти все, потом await».
:::


@@append id="p5-async-pitfalls"
## Закрепление {#lab}

:::viz async deadlock
:::

:::quiz Ловушки async
? Почему `async void` опасен? #async
+ Исключение нельзя перехватить снаружи — оно уходит в контекст и может уронить процесс; вызывающий не может дождаться завершения
- Он медленнее
- Он не компилируется
- Он блокирует поток
= `async void` — только для обработчиков событий. Иначе возвращай `Task`.

? Что делает `.Result` / `.Wait()` на незавершённой задаче в приложении с контекстом синхронизации (UI, классический ASP.NET)? #async
+ Блокирует текущий поток, ожидая задачу, которой для завершения нужен именно этот поток — взаимная блокировка (deadlock)
- Ускоряет выполнение
- Ничего особенного
- Отменяет задачу
= «Async all the way»: не смешивай `await` и `.Result`.

? Как правильно отменять асинхронную операцию? #async
+ Передавать `CancellationToken` и проверять/пробрасывать его (`ct.ThrowIfCancellationRequested()`, `Task.Delay(ms, ct)`)
- Вызывать `Thread.Abort`
- Убивать процесс
- Никак
= Отмена в .NET — кооперативная: код сам проверяет токен.

? Что произойдёт с исключением в «забытой» задаче (`Task.Run(() => Work());` без await)? #async
+ Оно останется в задаче незамеченным: ошибка потеряется
- Приложение сразу упадёт
- Исключение пробросится вызывающему
- Задача перезапустится
= Fire-and-forget нужно оформлять осознанно (логирование, BackgroundService).
:::

:::compare Блокировка через .Result
@intro Две реализации одного метода в ASP.NET-сервисе.
@bad
~~~csharp
public string GetName(int id)
{
    // блокируем поток, ожидая сеть
    return _client.GetStringAsync("/users/" + id).Result;
}
~~~
@badwhy
Поток пула занят, но ничего не делает. Под нагрузкой пул исчерпывается (thread pool starvation), а в окружениях с контекстом синхронизации возможен дедлок. Исключения оборачиваются в `AggregateException`.
@good
~~~csharp
public async Task<string> GetNameAsync(int id, CancellationToken ct)
{
    return await _client.GetStringAsync("/users/" + id, ct);
}
~~~
@goodwhy
Поток освобождается на время ожидания, исключения приходят как есть, поддерживается отмена. Асинхронность должна идти «до самого верха».
:::

:::ticket Исключение пропало
@key BUG-402
@type Bug
@prio High
@reporter Рома (бэкенд)
@labels async, исключения
@xp 85
@task
`SaveAsync` объявлен как `async void`: когда в `Save` падает `ArgumentNullException`, вызывающий код об этом не узнаёт (а в проде процесс падает с unhandled exception). Тест не может ни дождаться завершения, ни перехватить ошибку.

**Нужно:** метод должен возвращать `Task`, чтобы вызывающий мог сделать `await` и поймать исключение.
@code
~~~csharp
using System;
using System.Threading.Tasks;

public class Repo
{
    public int Saved;
    public void Save(string s)
    {
        if (s == null) throw new ArgumentNullException("s");
        Saved++;
    }
}

public static class Solver
{
    public static async void SaveAsync(Repo r, string s)
    {
        await Task.Delay(10);
        r.Save(s);
    }
}
~~~
@tests
~~~csharp
class T
{
    public static void Run()
    {
        var repo = new Repo();
        Solver.SaveAsync(repo, "x").GetAwaiter().GetResult();
        Assert.Equal(1, repo.Saved, "сохранено");
        Assert.Throws<ArgumentNullException>(() => Solver.SaveAsync(repo, null).GetAwaiter().GetResult());
    }
}
~~~
@forbid async\s+void => async void запрещён
@hint
Замени `async void` на `async Task` — тело менять не нужно.
@solution
~~~csharp
using System;
using System.Threading.Tasks;

public class Repo
{
    public int Saved;
    public void Save(string s)
    {
        if (s == null) throw new ArgumentNullException("s");
        Saved++;
    }
}

public static class Solver
{
    public static async Task SaveAsync(Repo r, string s)
    {
        await Task.Delay(10);
        r.Save(s);
    }
}
~~~
@why
Возвращаемый `Task` — это «канал» для результата и исключения. Без него ошибка некуда попадает. Правило: `async void` — только для обработчиков событий UI.
:::

:::ticket Отмена не работает
@key BUG-415
@type Bug
@prio Medium
@reporter Игорь (поддержка)
@labels async, отмена
@xp 90
@task
Пользователь закрывает страницу, но `ProcessAsync` продолжает обрабатывать все элементы: токен отмены принимается, но игнорируется.

**Нужно:** при отмене прекратить работу и бросить `OperationCanceledException`. Тест отменяет операцию после третьего элемента и проверяет, что остальные не обрабатывались.
@code
~~~csharp
using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;

public static class Solver
{
    public static async Task<int> ProcessAsync(List<int> items, Action<int> onItem, CancellationToken ct)
    {
        int n = 0;
        foreach (var i in items)
        {
            await Task.Delay(10);
            onItem(i);
            n++;
        }
        return n;
    }
}
~~~
@tests
~~~csharp
class T
{
    public static void Run()
    {
        var items = new List<int> { 1, 2, 3, 4, 5, 6, 7, 8, 9, 10 };
        var cts = new CancellationTokenSource();
        int seen = 0;
        Action<int> cb = i => { seen++; if (seen == 3) cts.Cancel(); };
        Assert.Throws<OperationCanceledException>(() => Solver.ProcessAsync(items, cb, cts.Token).GetAwaiter().GetResult());
        Assert.Equal(3, seen, "обработка остановлена после отмены");

        int seen2 = 0;
        var n = Solver.ProcessAsync(items, i => seen2++, CancellationToken.None).GetAwaiter().GetResult();
        Assert.Equal(10, n, "без отмены обрабатываются все");
    }
}
~~~
@require ThrowIfCancellationRequested|IsCancellationRequested => Токен нужно проверять (ThrowIfCancellationRequested)
@hint
В начале каждой итерации: `ct.ThrowIfCancellationRequested();`.
@solution
~~~csharp
using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;

public static class Solver
{
    public static async Task<int> ProcessAsync(List<int> items, Action<int> onItem, CancellationToken ct)
    {
        int n = 0;
        foreach (var i in items)
        {
            ct.ThrowIfCancellationRequested();
            await Task.Delay(10);
            onItem(i);
            n++;
        }
        return n;
    }
}
~~~
@why
Отмена в .NET **кооперативная**: никто не убьёт твой код извне — токен лишь сообщает «пора остановиться», а проверять его должен код. Проверяй токен на границах итераций и передавай его вниз в каждый вызов, который его принимает.
:::

:::cards Ловушки async
async void :: Только для обработчиков событий; иначе — Task.
.Result / .Wait() :: Блокируют поток; риск deadlock и starvation; «async all the way».
CancellationToken :: Кооперативная отмена: передавай вниз и проверяй.
Fire-and-forget :: Исключение теряется — логируй или используй BackgroundService.
:::


@@append id="p5-concurrency"
## Закрепление {#lab}

:::viz threadpool
:::

:::quiz Многопоточность
? Что выведет в худшем случае код из двух потоков, выполняющих по 1000 раз `counter++` (без синхронизации)? #async
+ Меньше 2000: `++` — это чтение, увеличение и запись, и потоки затирают друг друга
- Ровно 2000
- Больше 2000
- Исключение
= Гонка данных. Лечится `Interlocked.Increment` или `lock`.

? Когда использовать `Interlocked`, а когда `lock`? #async
+ `Interlocked` — для одной атомарной операции над числом; `lock` — для защиты составных операций над общим состоянием
- Никогда не использовать
- Всегда `lock`
- `Interlocked` для строк
= Чем проще примитив, тем он быстрее.

? Что такое deadlock в многопоточном коде? #async
+ Потоки взаимно ждут друг друга (A держит lock1 и ждёт lock2, B — наоборот) и навсегда зависают
- Падение процесса
- Утечка памяти
- Слишком много потоков
= Защита — единый порядок захвата блокировок.

? Чем `SemaphoreSlim` отличается от `lock`? #async
+ Ограничивает число одновременных участников (N, а не 1) и работает с `await` (`WaitAsync`)
- Ничем
- Он медленнее всегда
- Нельзя использовать в async-коде
= `lock` нельзя использовать вокруг `await`.
:::

:::cards Многопоточность
Гонка данных :: Несколько потоков меняют общее состояние без синхронизации; `++` не атомарен.
lock / Interlocked :: lock — составные операции; Interlocked — простые атомарные.
SemaphoreSlim :: Ограничитель параллелизма, дружит с await.
Deadlock :: Взаимное ожидание; единый порядок захвата блокировок.
:::


@@append id="p5-background"
## Закрепление {#lab}

:::quiz Фоновые задачи
? Зачем использовать `BackgroundService`, а не `Task.Run` из контроллера? #async
+ Хост управляет жизненным циклом: корректная остановка (CancellationToken), перехват и логирование ошибок
- Он быстрее
- Это единственный способ
- Task.Run запрещён
= Забытые `Task.Run` теряют ошибки и обрываются при остановке приложения.

? Для чего нужен `Channel<T>`? #async
+ Потокобезопасная очередь «производитель → потребитель» с поддержкой async
- Для обмена данными между процессами
- Для логирования
- Для работы с файлами
= Контроллер кладёт задачу в канал — фоновый сервис её обрабатывает.
:::

:::cards Фон
BackgroundService :: Долгоживущая фоновая работа с управляемым жизненным циклом.
Channel<T> :: Async-очередь producer/consumer.
:::


@@append id="p5-unit-tests"
## Закрепление {#lab}

:::quiz Unit-тесты
? Что означает паттерн AAA в тесте? #test
+ Arrange (подготовка) → Act (действие) → Assert (проверка)
- Always Assert Anything
- Async And Await
- Abstract, Apply, Analyze
= Один тест — одно действие и один смысл проверки.

? Какой тест лучше? #test
+ `Withdraw_AmountGreaterThanBalance_Throws` — имя описывает условие и ожидание
- `Test1`
- `WithdrawTest`
- `ItWorks`
= По имени упавшего теста должно быть ясно, что сломалось.

? Почему тест на `DateTime.Now` может «мигать» (flaky)? #test
+ Результат зависит от внешнего состояния — текущего времени, а не только от входных данных
- DateTime работает медленно
- Он потокоопасен
- Это не проблема
= Скрой время за `IClock`/`TimeProvider` и подставляй фиксированное.
:::

:::ticket Тест не написать: зашитое время
@key QA-12
@type Task
@prio Medium
@reporter Максим (QA)
@labels тестируемость, DI
@xp 80
@task
`Greeter.Greet()` приветствует по времени суток, но берёт `DateTime.Now` напрямую — протестировать утро/вечер невозможно.

**Нужно:** внедрить зависимость `IClock` через конструктор. Правила: до 12 часов → «Доброе утро», до 18 → «Добрый день», иначе «Добрый вечер».
@code
~~~csharp
using System;

public interface IClock
{
    DateTime Now { get; }
}

public class Greeter
{
    public string Greet()
    {
        var h = DateTime.Now.Hour;
        if (h < 12) return "Доброе утро";
        if (h < 18) return "Добрый день";
        return "Добрый вечер";
    }
}
~~~
@tests
~~~csharp
class T
{
    class FakeClock : IClock
    {
        public DateTime Now { get; set; }
    }

    public static void Run()
    {
        var clock = new FakeClock { Now = new DateTime(2024, 5, 1, 8, 0, 0) };
        var g = new Greeter(clock);
        Assert.Equal("Доброе утро", g.Greet(), "8:00");
        clock.Now = new DateTime(2024, 5, 1, 14, 30, 0);
        Assert.Equal("Добрый день", g.Greet(), "14:30");
        clock.Now = new DateTime(2024, 5, 1, 21, 0, 0);
        Assert.Equal("Добрый вечер", g.Greet(), "21:00");
        clock.Now = new DateTime(2024, 5, 1, 12, 0, 0);
        Assert.Equal("Добрый день", g.Greet(), "ровно полдень");
    }
}
~~~
@forbid DateTime\.(Now|UtcNow|Today) => Greeter не должен обращаться к системным часам напрямую
@hint
Поле `private readonly IClock _clock;`, конструктор `public Greeter(IClock clock) { _clock = clock; }`, дальше `_clock.Now.Hour`.
@solution
~~~csharp
using System;

public interface IClock
{
    DateTime Now { get; }
}

public class Greeter
{
    private readonly IClock _clock;

    public Greeter(IClock clock)
    {
        _clock = clock;
    }

    public string Greet()
    {
        var h = _clock.Now.Hour;
        if (h < 12) return "Доброе утро";
        if (h < 18) return "Добрый день";
        return "Добрый вечер";
    }
}
~~~
@why
Недетерминированные источники (время, случайные числа, сеть, файлы) прячут за интерфейсами и подставляют в тестах. Это и есть Dependency Inversion на практике. В современном .NET для времени есть готовый `TimeProvider`.
:::

:::cards Unit-тесты
AAA :: Arrange → Act → Assert.
Детерминизм :: Тест не должен зависеть от времени, сети, порядка запуска.
Имя теста :: Метод_Условие_Ожидание.
:::


@@append id="p5-mocks"
## Закрепление {#lab}

:::quiz Моки и TDD
? Чем mock отличается от stub? #test
+ Stub подставляет заготовленные ответы; mock ещё и проверяет, что его вызвали нужным образом
- Ничем
- Stub — для баз данных
- Mock хранит данные
= Не злоупотребляй проверками вызовов: они привязывают тест к реализации.

? Что такое цикл TDD? #test
+ Red (падающий тест) → Green (минимальный код) → Refactor
- Design → Develop → Deploy
- Test → Deploy
- Code → Test → Fix
= Тест, написанный первым, формирует API.

? Что НЕ стоит мокать? #test
+ Простые value-объекты и собственную чистую логику — используй настоящие экземпляры
- Сетевые клиенты
- Часы
- Отправку почты
= Мокай границы системы, а не всё подряд.
:::

:::ticket Рассылка отправляет настоящие письма
@key QA-18
@type Task
@prio High
@reporter Максим (QA)
@labels тестируемость, моки
@xp 90
@task
`Notifier` создаёт `RealSender` внутри метода, поэтому тест при запуске пытается выйти в сеть (и падает). Ещё одно правило: отписанным пользователям письма не отправляются.

**Нужно:** принимать `IEmailSender` через конструктор. В тесте будет подставлен собственный «шпион».
@code
~~~csharp
using System;

public interface IEmailSender
{
    void Send(string to, string text);
}

public class RealSender : IEmailSender
{
    public void Send(string to, string text)
    {
        throw new InvalidOperationException("нет сети");
    }
}

public class User
{
    public string Email { get; set; }
    public bool Subscribed { get; set; }
}

public class Notifier
{
    public void Notify(User u, string text)
    {
        var sender = new RealSender();
        if (u.Subscribed) sender.Send(u.Email, text);
    }
}
~~~
@tests
~~~csharp
class T
{
    class SpySender : IEmailSender
    {
        public int Count;
        public string LastTo;
        public string LastText;
        public void Send(string to, string text) { Count++; LastTo = to; LastText = text; }
    }

    public static void Run()
    {
        var spy = new SpySender();
        var n = new Notifier(spy);
        n.Notify(new User { Email = "a@b.ru", Subscribed = true }, "Привет");
        Assert.Equal(1, spy.Count, "письмо отправлено");
        Assert.Equal("a@b.ru", spy.LastTo, "адресат");
        Assert.Equal("Привет", spy.LastText, "текст");

        n.Notify(new User { Email = "c@d.ru", Subscribed = false }, "Реклама");
        Assert.Equal(1, spy.Count, "отписанному не отправляем");
    }
}
~~~
@forbid new\s+RealSender => Notifier не должен создавать RealSender сам
@hint
Конструктор `Notifier(IEmailSender sender)` и поле; в `Notify` используй `_sender`.
@solution
~~~csharp
using System;

public interface IEmailSender
{
    void Send(string to, string text);
}

public class RealSender : IEmailSender
{
    public void Send(string to, string text)
    {
        throw new InvalidOperationException("нет сети");
    }
}

public class User
{
    public string Email { get; set; }
    public bool Subscribed { get; set; }
}

public class Notifier
{
    private readonly IEmailSender _sender;

    public Notifier(IEmailSender sender)
    {
        _sender = sender;
    }

    public void Notify(User u, string text)
    {
        if (u.Subscribed) _sender.Send(u.Email, text);
    }
}
~~~
@why
Класс `SpySender` из теста — рукописный мок: работает без библиотек (Moq/NSubstitute — просто сахар поверх той же идеи). Главное — класс не создаёт зависимости сам, а получает их снаружи.
:::

:::cards Моки
Stub vs Mock :: Stub отдаёт данные; Mock проверяет взаимодействие.
Мокай границы :: Сеть, БД, время, почта; не мокай свои чистые функции.
TDD :: Red → Green → Refactor.
:::


@@append id="p5-integration"
## Закрепление {#lab}

:::quiz Интеграционные тесты
? Для чего нужен `WebApplicationFactory<T>`? #test
+ Поднимает приложение в памяти и даёт `HttpClient` для вызовов API без реального сервера
- Для мокирования БД
- Для сборки Docker-образа
- Для нагрузочных тестов
= Через него тестируют весь pipeline: routing, middleware, фильтры.

? Чем интеграционные тесты отличаются от unit-тестов? #test
+ Проверяют взаимодействие нескольких компонентов (иногда с реальной БД), медленнее, но находят проблемы стыков
- Они быстрее
- Не используют код приложения
- Заменяют unit-тесты
= Пирамида тестов: много unit, меньше интеграционных, мало E2E.
:::

:::cards Интеграционные тесты
WebApplicationFactory :: Тестовый хост приложения в памяти.
Пирамида тестов :: Много unit → меньше интеграционных → мало E2E.
:::


@@append id="p5-patterns"
## Закрепление {#lab}

:::quiz Паттерны
? Какой паттерн «оборачивает» объект того же интерфейса, добавляя поведение (кэш, логирование)? #oop
+ Decorator
- Factory
- Singleton
- Mediator
= Клиент не знает, что работает с обёрткой.

? Strategy позволяет… #oop
+ Подменять алгоритм (скидку, сортировку, расчёт) без правки клиента через общий интерфейс
- Создавать объекты
- Хранить единственный экземпляр
- Передавать запросы по цепочке
= Strategy — основной способ избавиться от `switch` по типу.
:::

:::ticket Кэширующий декоратор
@key PERF-44
@type Story
@prio Medium
@reporter Макс (TL)
@labels паттерны, Decorator
@xp 85
@task
`SlowPriceService` ходит во внешний прайс-лист (дорого). Не меняя его код, реализуй `CachedPriceService : IPriceService` — **декоратор**: хранит результаты по `id` и обращается к «внутреннему» сервису только если цены ещё нет в кэше.
@code
~~~csharp
using System;
using System.Collections.Generic;

public interface IPriceService
{
    decimal GetPrice(int id);
}

public class SlowPriceService : IPriceService
{
    public int Calls;
    public decimal GetPrice(int id)
    {
        Calls++;
        return id * 10m;
    }
}

public class CachedPriceService
{
    public decimal GetPrice(int id)
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
        var inner = new SlowPriceService();
        IPriceService svc = new CachedPriceService(inner);
        Assert.Equal(50m, svc.GetPrice(5), "первое обращение");
        Assert.Equal(50m, svc.GetPrice(5), "из кэша");
        Assert.Equal(1, inner.Calls, "внутренний сервис вызван один раз");
        Assert.Equal(70m, svc.GetPrice(7), "другой id");
        Assert.Equal(2, inner.Calls, "два разных id — два вызова");
    }
}
~~~
@require :\s*IPriceService => CachedPriceService должен реализовывать IPriceService
@hint
`public class CachedPriceService : IPriceService`, поля `_inner` и `Dictionary<int, decimal> _cache`; в `GetPrice` — `TryGetValue`, иначе вызов `_inner.GetPrice` и сохранение.
@solution
~~~csharp
using System;
using System.Collections.Generic;

public interface IPriceService
{
    decimal GetPrice(int id);
}

public class SlowPriceService : IPriceService
{
    public int Calls;
    public decimal GetPrice(int id)
    {
        Calls++;
        return id * 10m;
    }
}

public class CachedPriceService : IPriceService
{
    private readonly IPriceService _inner;
    private readonly Dictionary<int, decimal> _cache = new Dictionary<int, decimal>();

    public CachedPriceService(IPriceService inner)
    {
        _inner = inner;
    }

    public decimal GetPrice(int id)
    {
        if (_cache.TryGetValue(id, out var price)) return price;
        price = _inner.GetPrice(id);
        _cache[id] = price;
        return price;
    }
}
~~~
@why
Декоратор добавляет поведение, не трогая оригинал (Open/Closed) и не раскрывая себя клиенту (Liskov). В ASP.NET Core такие обёртки подключают через DI — так же устроены, например, логирующие и кэширующие слои вокруг HTTP-клиента. В реальном коде добавь в кэш срок жизни и потокобезопасность.
:::

:::cards Паттерны
Strategy :: Подменяемый алгоритм через интерфейс (вместо switch).
Decorator :: Обёртка того же интерфейса с добавочным поведением.
Factory :: Скрывает создание объекта и выбор реализации.
Mediator :: Объекты общаются через посредника, а не друг с другом напрямую.
:::


@@append id="p5-git"
## Закрепление {#lab}

:::quiz Git
? Чем `git merge` отличается от `git rebase`? #test
+ merge сохраняет историю и создаёт merge-коммит; rebase переписывает коммиты поверх другой базы — история линейная
- Ничем
- rebase удаляет коммиты
- merge работает только локально
= Не делай rebase над опубликованными общими ветками.

? Что делает `git revert`? #test
+ Создаёт новый коммит, отменяющий изменения указанного коммита, не переписывая историю
- Удаляет коммит из истории
- Откатывает рабочий каталог
- Перезаписывает ветку
= Безопасный способ «отменить» в общей ветке.
:::

:::cards Git
merge vs rebase :: merge — сохраняет историю; rebase — переписывает, линейная история.
revert vs reset :: revert — новый коммит-отмена; reset — двигает ветку (опасно на общих).
:::


@@append id="p5-ci"
## Закрепление {#lab}

:::quiz CI
? Что должен делать CI на каждый pull request? #test
+ Собрать проект, прогнать тесты (и линтеры) и показать результат до merge
- Развернуть на production
- Только собрать
- Ничего: проверяет ревьюер
= Автоматическая проверка — защита от «у меня работает».

? Почему секреты в GitHub Actions хранят в Secrets, а не в yaml? #test
+ Файл workflow лежит в репозитории и виден всем; Secrets скрыты и маскируются в логах
- Так быстрее
- Yaml не поддерживает строки
- Это требование .NET
= Утёкший токен — компрометация всего окружения.
:::

:::cards CI
CI :: Сборка + тесты на каждое изменение; красный CI блокирует merge.
Secrets :: Хранятся вне репозитория, подставляются в pipeline.
:::


@@append id="p5-project"
## Код-ревью: фоновый отчёт {#lab}

:::legacy ReportService с «оптимизациями»
@context Сервис «иногда зависает под нагрузкой», память растёт, а письма с отчётами иногда не приходят — и в логах тишина.
@code
~~~csharp
public class ReportService
{
    private static List<string> _cache = new List<string>();

    public string BuildReport(int userId)
    {
        var data = _http.GetStringAsync("https://api/data/" + userId).Result;
        _cache.Add(data);
        Task.Run(() => SendEmail(data));
        return data.ToUpper();
    }

    public async void Refresh()
    {
        while (true)
        {
            await Task.Delay(1000);
            var d = await _http.GetStringAsync("https://api/data");
            _cache.Add(d);
        }
    }
}
~~~
@bug 3 | [leak] Статический список растёт бесконечно | Каждый вызов добавляет строку в `_cache`, ничего не удаляется — память не освобождается; к тому же `List<T>` небезопасен для многопоточного доступа.
@bug 7 | [async] `.Result` блокирует поток пула | Под нагрузкой пул потоков исчерпывается (starvation) — «зависания»; возможен deadlock; исключения приходят в `AggregateException`. Нужен `await`.
@bug 8 | [bug] Гонка при записи в общий список | Параллельные `Add` из нескольких запросов могут повредить внутреннее состояние списка или потерять данные — нужен потокобезопасный контейнер или блокировка.
@bug 9 | [async] Fire-and-forget без обработки ошибок | Исключение в `SendEmail` потеряется — письма «не приходят», а логи пусты. Нужна очередь + `BackgroundService` с логированием.
@bug 13-20 | [async] `async void` с бесконечным циклом без токена | Исключение уронит процесс, дождаться и остановить цикл нельзя (при остановке хоста он оборвётся), `_cache` растёт. Нужен `BackgroundService` с `CancellationToken` и `try/catch` внутри цикла.
@fixed
~~~csharp
public class ReportService
{
    private readonly HttpClient _http;
    private readonly Channel<string> _emails;
    private readonly ILogger<ReportService> _log;

    public ReportService(HttpClient http, Channel<string> emails, ILogger<ReportService> log)
    { _http = http; _emails = emails; _log = log; }

    public async Task<string> BuildReportAsync(int userId, CancellationToken ct)
    {
        var data = await _http.GetStringAsync($"https://api/data/{userId}", ct);
        await _emails.Writer.WriteAsync(data, ct);   // отправку обработает BackgroundService
        return data.ToUpperInvariant();
    }
}
~~~
:::


@@append id="p5"
## Итоговый тест фазы 5 {#lab}

:::quiz Итог фазы 5: async, тесты, паттерны
? Что произойдёт? #async
| public async Task<int> GetAsync()
| {
|     await Task.Delay(1000);
|     return 5;
| }
| int x = GetAsync().Result;   // в консольном приложении
+ Поток заблокируется на секунду и вернёт 5 (дедлока нет — нет контекста синхронизации), но блокировать так всё равно плохо
- Мгновенно вернёт 5
- Исключение
- Вернёт 0
= Дедлок возникает при наличии контекста синхронизации (UI, классический ASP.NET). Но практика «.Result в async-коде» вредна и без него.

? Какой вариант запускает три независимые задачи параллельно? #async
+ `var t1 = A(); var t2 = B(); var t3 = C(); await Task.WhenAll(t1, t2, t3);`
- `await A(); await B(); await C();`
- `A().Wait(); B().Wait();`
- `Task.Run` в цикле с `.Result`
= Сначала запуск всех задач, потом общее ожидание.

? Зачем нужен `ConfigureAwait(false)` в библиотечном коде? #async
+ Не возвращаться в исходный контекст синхронизации — меньше накладных расходов и риск deadlock
- Ускоряет сеть
- Отключает await
- Делает метод синхронным
= В ASP.NET Core контекста синхронизации нет, но в библиотеках привычка остаётся полезной.

? Чем плох тест, проверяющий порядок вызовов приватных методов мока? #test
+ Он привязан к реализации: любой рефакторинг ломает тест без изменения поведения
- Он слишком быстрый
- Он ничего не проверяет
- Он не запустится
= Тестируй наблюдаемое поведение, а не внутренности.

? Какой принцип лучше всего описывает «передать IEmailSender в конструктор вместо new в методе»? #oop
+ Dependency Inversion / Inversion of Control
- Single Responsibility
- Liskov
- Interface Segregation
= Зависимости приходят снаружи, и их можно подменять.

? Что даст `lock` вокруг `await`? #async
+ Не скомпилируется: в `lock` нельзя использовать `await` — используй `SemaphoreSlim.WaitAsync`
- Работает как обычно
- Ускорит код
- Создаст дедлок
= Блокировка принадлежит потоку, а после await продолжение может уйти на другой.

? Тест иногда проходит, иногда нет — без изменений в коде. Что подозревать в первую очередь? #test
+ Недетерминизм: время, порядок, параллелизм, общее состояние между тестами
- Опечатку в имени
- Версию .NET
- Размер экрана
= Flaky-тесты разрушают доверие к CI.

? В чём смысл CI? #test
+ Быстро и автоматически сообщать, что изменение ломает сборку или тесты
- Заменить код-ревью
- Автоматически писать код
- Скрывать ошибки
= Чем раньше обнаружена проблема, тем дешевле её исправить.
:::

:::interview async/await под капотом
@q Что на самом деле происходит, когда метод доходит до `await`?
@trap Знает ли кандидат про конечный автомат и освобождение потока, а не «создаётся новый поток».
@answer
Компилятор превращает async-метод в конечный автомат: локальные переменные становятся полями структуры/класса. Выполнение идёт синхронно, пока не встретится `await` на **незавершённой** задаче. Тогда метод регистрирует продолжение (`continuation`) в задаче и возвращает управление вызывающему — поток освобождается. Когда задача завершается (обычно по уведомлению от ОС при I/O), продолжение запланировано на пуле потоков (или в исходном контексте синхронизации). Новый поток для самого ожидания не нужен. Если задача уже завершена, `await` проходит синхронно.
@fail «await создаёт новый поток» — это путает асинхронность с многопоточностью.
@follow Что изменится при `ConfigureAwait(false)`? А в `.Result`?
:::

:::interview Что такое deadlock и как его избежать
@q Приведите пример взаимной блокировки в async-коде и в многопоточном коде.
@trap Различает две природы дедлока: контекст синхронизации и порядок блокировок.
@answer
В async-коде: метод в UI/классическом ASP.NET вызывает `.Result` на задаче, продолжение которой должно вернуться в тот же контекст — а он занят ожиданием. Лечение: `await` до верха стека; `ConfigureAwait(false)` в библиотеках. В многопоточном коде: поток A держит `lockA` и ждёт `lockB`, поток B — наоборот. Лечение: единый порядок захвата, минимизация времени под блокировкой, `SemaphoreSlim`/таймауты, неизменяемые данные.
@fail «Deadlock — это когда программа работает долго» — нет, это вечное взаимное ожидание.
:::

:::cards Фаза 5: минимум
await :: Не блокирует поток: метод — конечный автомат, продолжение вызывается после завершения задачи.
async void :: Только обработчики событий; иначе Task.
Параллельные задачи :: Запусти все, затем await Task.WhenAll.
Тестируемость :: Недетерминированное (время, сеть) прячь за интерфейсом и внедряй.
AAA и CI :: Arrange-Act-Assert; CI — автоматическая проверка каждого изменения.
:::
