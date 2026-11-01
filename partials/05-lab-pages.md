@@page id="lab" phase="0" group="start" kind="common" title="Лаборатория: IDE, квизы, тикеты, ранги" nav="Лаборатория (как играть)"
:::why
Прочитать про `struct` и `class` — это 20% дела. Остальные 80% — **потрогать руками**: запустить код, ошибиться, получить замечание тимлида, найти баг в чужом легаси. Поэтому в каждой теме есть живые блоки. Всё работает офлайн, прямо на странице.
:::

## Что внутри

| Блок | Что делает | Награда |
|---|---|---|
| **QUIZ** | Вопросы на инженерное понимание: память, O(N), ООП, .NET под капотом. Ошибки автоматически уходят в карточки для повторения | XP за ответы |
| **IDE** | Встроенный редактор C# с виртуальной консолью. Ошибки компиляции подсвечиваются при наборе. Скрытые тесты + ревью кода | до 120 XP |
| **Тикет** | Задача в стиле Jira: баг, async-исключение, рефакторинг легаси | 60–120 XP |
| **VS** | «Как НЕ НАДО» против «Как НАДО» — с запуском и оценкой ревью | XP |
| **LEGACY** | Реальный плохой код: находишь утечки, гонки и тормоза, кликая по строкам | XP за каждый баг |
| **Вопрос с подвохом** | Разбор собеседований: что на самом деле проверяют и как отвечать | XP |
| **Карточки** | Интервальные повторения (система Лейтнера) — перед новой главой | XP |
| **VIZ** | Визуализаторы: стек и куча, фазы GC, ThreadPool, async/await | XP |

:::warn Честно о встроенной IDE
Это **не Roslyn и не .NET**. Код выполняет интерпретатор подмножества C#, написанный на JavaScript: классы, структуры, record, интерфейсы, дженерики, LINQ, исключения, `async/await` (с виртуальным временем), коллекции, строковое форматирование. Сообщения об ошибках повторяют номера компилятора (`CS0103`, `CS0029`…), но формулировки и покрытие — свои. Нет файловой системы, сети, реальных потоков и рефлексии. Для обучения хватает; **настоящую проверку всегда делай в Visual Studio / Rider / `dotnet run`**.
:::

## Попробуй: разминка

Реши задачу. Если код не компилируется — подсветка и консоль покажут, где. Кнопка «Сдать на проверку» запускает скрытые тесты и ревью. Горячая клавиша запуска — <kbd>Ctrl</kbd>+<kbd>Enter</kbd>.

:::ide FizzBuzz без стыда
@xp 30
@task
Реализуй `Solver.FizzBuzz(int n)`: для чисел, кратных 3 — `"Fizz"`, кратных 5 — `"Buzz"`, кратных обоим — `"FizzBuzz"`, иначе — само число строкой.
@code
~~~csharp
using System;

public static class Solver
{
    public static string FizzBuzz(int n)
    {
        // TODO
        return "";
    }
}

class Program
{
    static void Main()
    {
        for (int i = 1; i <= 15; i++)
            Console.WriteLine(Solver.FizzBuzz(i));
    }
}
~~~
@tests
~~~csharp
class T
{
    public static void Run()
    {
        Assert.Equal("1", Solver.FizzBuzz(1), "1 → \"1\"");
        Assert.Equal("Fizz", Solver.FizzBuzz(3), "3 → Fizz");
        Assert.Equal("Buzz", Solver.FizzBuzz(10), "10 → Buzz");
        Assert.Equal("FizzBuzz", Solver.FizzBuzz(15), "15 → FizzBuzz");
        Assert.Equal("98", Solver.FizzBuzz(98), "98 → \"98\"");
    }
}
~~~
@hint
Сначала проверь самый «узкий» случай — кратность и 3, и 5 (то есть 15). Если проверить 3 раньше, до `FizzBuzz` дело не дойдёт.
@hint
`if (n % 15 == 0) return "FizzBuzz";` затем `n % 3`, `n % 5`, а в конце — `n.ToString()`.
@solution
~~~csharp
using System;

public static class Solver
{
    public static string FizzBuzz(int n)
    {
        if (n % 15 == 0) return "FizzBuzz";
        if (n % 3 == 0) return "Fizz";
        if (n % 5 == 0) return "Buzz";
        return n.ToString();
    }
}
~~~
@why
Порядок проверок — часть логики: самое специфичное условие идёт первым. Заметь: никаких вложенных `if`, только ранние `return` (guard clauses).
:::

## Разминка по памяти: квиз

:::quiz Проверь себя: память и сложность
? Где окажутся данные переменной `p` в методе, если `Point` — это `struct` и она локальная? #memory
- В куче, а в стеке будет ссылка
- В статической области
+ Прямо в стеке (в кадре метода)
- В регистре процессора всегда
= Значимые типы хранят данные «на месте» — там, где объявлена переменная. Для локальной это кадр стека. (Если struct — поле класса, она будет внутри объекта в куче.)

? Что делает `list.Contains(x)` в цикле на N элементов по списку из M? #bigo
- O(N + M)
- O(N)
+ O(N · M)
- O(log M)
= `List<T>.Contains` — линейный поиск O(M), и его вызывают N раз. Решение: `HashSet<T>` — поиск O(1), итого O(N + M).

? Почему `string s = ""; for (...) s += "x";` — плохая идея? #net
- Строки в C# — значимый тип, поэтому копируются
+ Строки неизменяемы: каждая итерация создаёт новую строку и копирует старую — O(N²)
- Оператор += запрещён для строк
- GC не умеет собирать строки
= Неизменяемость: `+=` — это `s = s + "x"`, то есть новый объект. Для сборки в цикле — `StringBuilder`.

? Что напечатает программа? #oop
| Animal a = new Dog();
| Console.WriteLine(a.Speak());
| // class Animal { public string Speak() => "..."; }
| // class Dog : Animal { public new string Speak() => "Гав"; }
- Гав
+ ...
- Ошибка компиляции
- NullReferenceException
= Метод **скрыт** (`new`), а не переопределён (`override`). Вызов идёт по статическому типу переменной (`Animal`). Для полиморфизма нужны `virtual` + `override`.
:::

## Сравнение: как НЕ НАДО и как НАДО

:::compare Исключение: throw ex против throw
@intro
Один из самых частых вопросов на ревью.
@bad
~~~csharp
using System;
try
{
    Process();
}
catch (Exception ex)
{
    Console.WriteLine("лог: " + ex.Message);
    throw ex;
}
static void Process() => throw new InvalidOperationException("упало в Process");
~~~
@badwhy
`throw ex;` **перезаписывает stack trace**: он начнётся с места `throw ex`, а информация о реальной точке падения (`Process`) пропадёт.
@good
~~~csharp
using System;
try
{
    Process();
}
catch (Exception ex)
{
    Console.WriteLine("лог: " + ex.Message);
    throw;
}
static void Process() => throw new InvalidOperationException("упало в Process");
~~~
@goodwhy
`throw;` пробрасывает то же исключение **вместе с исходным стеком**. Нужно добавить контекст — оберни: `throw new MyException("...", ex);`.
:::

## Легаси: найди проблемы

:::legacy Кэш курсов валют (прод, 2017)
@context Сервис раз в минуту обновляет кэш курсов; его читают сотни потоков. Жалобы: «иногда падает», «память растёт», «в понедельник тормозит».
@code
~~~csharp
public class RateCache
{
    public static Dictionary<string, double> Rates = new Dictionary<string, double>();
    private static List<Action> _subs = new List<Action>();

    public void Subscribe(Action cb) { _subs.Add(cb); }

    public double Get(string code)
    {
        return Rates[code];
    }

    public void Refresh()
    {
        var data = new HttpClient().GetStringAsync("https://rates.example/api").Result;
        foreach (var line in data.Split('\n'))
        {
            var p = line.Split(';');
            Rates[p[0]] = double.Parse(p[1]);
        }
        foreach (var s in _subs) s();
    }
}
~~~
@bug 2 | [race] Публичный изменяемый статический Dictionary | `Dictionary` не потокобезопасен: параллельные записи/чтения дают порчу структуры, бесконечные циклы и `InvalidOperationException`. Статическое публичное состояние ещё и ломает тесты. Нужен `ConcurrentDictionary` или иммутабельный снимок, заменяемый атомарно.
@bug 3 | [leak] Статический список подписчиков без отписки | Подписчики никогда не удаляются: каждый объект, подписавшийся через `Subscribe`, живёт вечно (достижим из статики). Классическая утечка памяти «через события». Нужен `Unsubscribe` / `WeakReference` / `IDisposable`-подписка.
@bug 9 | [bug] `Rates[code]` бросает KeyNotFoundException | Индексатор падает на отсутствующем коде. Для штатной ситуации «нет курса» нужен `TryGetValue` и осмысленный результат.
@bug 14 | [async] `.Result` на асинхронном вызове | Блокирует поток; в контексте с `SynchronizationContext` это дедлок, в пуле — голодание потоков (отсюда «тормозит в понедельник»). Метод должен быть `async Task` и использовать `await`.
@bug 14 | [leak] `new HttpClient()` на каждый вызов | Каждый экземпляр держит сокеты; под нагрузкой они зависают в TIME_WAIT и кончаются порты. Используй один общий `HttpClient`/`IHttpClientFactory`.
@bug 19 | [bug] `double.Parse` без культуры и без проверок | Зависит от текущей культуры (`1,5` против `1.5`) и падает на мусоре. Нужен `decimal.TryParse` с `CultureInfo.InvariantCulture`.
@fixed
~~~csharp
public class RateCache
{
    private static readonly HttpClient Http = new HttpClient();
    private readonly ConcurrentDictionary<string, decimal> _rates = new();

    public bool TryGet(string code, out decimal rate) => _rates.TryGetValue(code, out rate);

    public async Task RefreshAsync()
    {
        var data = await Http.GetStringAsync("https://rates.example/api");
        foreach (var line in data.Split('\n'))
        {
            var p = line.Split(';');
            if (p.Length == 2 && decimal.TryParse(p[1], NumberStyles.Number, CultureInfo.InvariantCulture, out var v))
                _rates[p[0]] = v;
        }
    }
}
~~~
:::

## Вопрос с подвохом

:::interview Равенство строк
@q Что выведет `object a = "hi"; object b = new string("hi".ToCharArray()); Console.WriteLine(a == b);` и почему?
@trap Проверяют, различаешь ли ты **ссылочное равенство** и **значения**. Оператор `==` для `object` сравнивает ссылки, а не перегруженный `==` у `string` — выбор перегрузки происходит на этапе компиляции по статическому типу.
@answer
Выведет `False`. Статический тип обеих переменных — `object`, поэтому используется `object ==` (сравнение ссылок), а это два разных объекта (второй создан явно). Если привести к `string` или вызвать `Equals`, получим `True`: `string` переопределяет и `==`, и `Equals` для сравнения содержимого.
@fail «True, потому что строки одинаковые». Это путаница статического типа и значения.
@follow Что изменится, если вместо `new string(...)` написать литерал `"hi"`? (Литералы интернируются — ссылки совпадут → `True`.)
:::

## Карточки

:::cards Основы памяти и типов
Где лежит локальная struct :: В стеке — внутри кадра метода (если она не поле класса).
Что такое boxing :: Копирование значимого типа в объект в куче при приведении к object/интерфейсу — аллокация.
Почему string неизменяема :: Безопасность, кэширование хэша, интернирование и потокобезопасность; цена — копирование при изменении.
Сложность List.Contains :: O(N) — линейный перебор.
Сложность Dictionary.TryGetValue :: O(1) в среднем (хэш-таблица).
:::

## Визуализаторы

:::viz heap
:::

:::viz gc
:::

:::viz threadpool
:::

:::viz async
:::


@@page id="profile" phase="0" group="start" kind="common" title="Профиль: ранг, XP, достижения" nav="Профиль и ранги"
:::widget profile
:::


@@page id="path" phase="0" group="start" kind="common" title="Карта пути: модули загораются" nav="Карта модулей"
Каждый модуль (тема) — станция. Когда ты закрываешь все пункты темы и решаешь её задания, станция **загорается**. Цвет линии — фаза пути.

:::widget pathmap
:::


@@page id="review" phase="0" group="start" kind="common" title="Повторение: карточки по Лейтнеру" nav="Повторение (карточки)"
:::why
Забываем мы не плавно, а по кривой: большая часть теряется за первые дни. Повторение в нарастающих интервалах (1 → 3 → 7 → 16 → 35 дней) удерживает знание на месяцы при затратах в минуты. Карточка попадает сюда, когда ты закрываешь тему, ошибаешься в квизе или не справляешься с вопросом собеседования.
:::

:::widget review
:::
