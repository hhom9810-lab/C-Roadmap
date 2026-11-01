@@append id="p1-practice"
## Тикеты: реальные задачи junior {#lab}

Три маленьких задачи в формате рабочего трекера. Читай описание как тикет, находи причину, чини, сдавай на проверку — ревью тимлида оценит не только тесты, но и качество кода.

:::ticket Пагинация: пропадают и падают элементы
@key SHOP-31
@type Bug
@prio High
@reporter Лена (продакт)
@labels алгоритмы, индексы
@xp 70
@task
Страницы нумеруются **с 1**. `GetPage(items, page, size)` должна возвращать элементы страницы. Сейчас:
- первая страница пропускается;
- на последней странице падает `ArgumentOutOfRangeException`;
- неверные `page`/`size` (< 1) никак не обрабатываются.

**Ожидается:** корректные срезы; за границей списка — пустой результат; `page < 1` или `size < 1` → `ArgumentOutOfRangeException`.
@code
~~~csharp
using System;
using System.Collections.Generic;

public static class Solver
{
    public static List<int> GetPage(List<int> items, int page, int size)
    {
        var res = new List<int>();
        int start = page * size;
        for (int i = start; i <= start + size; i++)
        {
            res.Add(items[i]);
        }
        return res;
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
        Assert.Equal(new List<int> { 1, 2, 3 }, Solver.GetPage(items, 1, 3), "страница 1");
        Assert.Equal(new List<int> { 4, 5, 6 }, Solver.GetPage(items, 2, 3), "страница 2");
        Assert.Equal(new List<int> { 10 }, Solver.GetPage(items, 4, 3), "неполная последняя страница");
        Assert.Equal(new List<int>(), Solver.GetPage(items, 5, 3), "за границей — пусто");
        Assert.Throws<ArgumentOutOfRangeException>(() => Solver.GetPage(items, 0, 3), "page = 0");
        Assert.Throws<ArgumentOutOfRangeException>(() => Solver.GetPage(items, 1, 0), "size = 0");
    }
}
~~~
@hint
Старт страницы: `(page - 1) * size`. Конец — `Math.Min(start + size, items.Count)`, и условие цикла строгое: `i < end`.
@solution
~~~csharp
using System;
using System.Collections.Generic;

public static class Solver
{
    public static List<int> GetPage(List<int> items, int page, int size)
    {
        if (page < 1) throw new ArgumentOutOfRangeException(nameof(page));
        if (size < 1) throw new ArgumentOutOfRangeException(nameof(size));

        var res = new List<int>();
        int start = (page - 1) * size;
        int end = Math.Min(start + size, items.Count);
        for (int i = start; i < end; i++)
        {
            res.Add(items[i]);
        }
        return res;
    }
}
~~~
@why
Три классических ошибки «на границе» в одном месте: смещение (`page * size` вместо `(page-1) * size`), нестрогое сравнение `<=` и отсутствие `Math.Min` с длиной коллекции. Всегда проверяй три случая: **пусто, одна единица, граница**.
:::

:::ticket NullReference в карточке пользователя
@key CRM-88
@type Bug
@prio Medium
@reporter Игорь (поддержка)
@labels null, строки
@xp 60
@task
`FullName(person)` падает, если у человека нет отчества (`Middle == null`), и тем более если сам `person == null`.

**Ожидается:**
- `null` → пустая строка;
- без отчества (или пустое/из пробелов) → `"Имя Фамилия"`;
- иначе → `"Имя Отчество Фамилия"`, лишние пробелы по краям частей убираются.
@code
~~~csharp
using System;

public class Person
{
    public string First { get; set; }
    public string Middle { get; set; }
    public string Last { get; set; }
}

public static class Solver
{
    public static string FullName(Person p)
    {
        return p.First + " " + p.Middle.Trim() + " " + p.Last;
    }
}
~~~
@tests
~~~csharp
class T
{
    public static void Run()
    {
        Assert.Equal("", Solver.FullName(null), "null → пустая строка");
        Assert.Equal("Анна Иванова", Solver.FullName(new Person { First = "Анна", Middle = null, Last = "Иванова" }), "без отчества (null)");
        Assert.Equal("Анна Иванова", Solver.FullName(new Person { First = "Анна", Middle = "   ", Last = "Иванова" }), "отчество из пробелов");
        Assert.Equal("Анна Петровна Иванова", Solver.FullName(new Person { First = " Анна ", Middle = "Петровна", Last = "Иванова" }), "полное имя, обрезка пробелов");
    }
}
~~~
@hint
Соберите непустые части в список/массив и склейте `string.Join(" ", parts)`. Проверка пустоты: `string.IsNullOrWhiteSpace`.
@solution
~~~csharp
using System;
using System.Collections.Generic;

public class Person
{
    public string First { get; set; }
    public string Middle { get; set; }
    public string Last { get; set; }
}

public static class Solver
{
    public static string FullName(Person p)
    {
        if (p == null) return "";
        var parts = new List<string>();
        foreach (var part in new[] { p.First, p.Middle, p.Last })
        {
            if (!string.IsNullOrWhiteSpace(part)) parts.Add(part.Trim());
        }
        return string.Join(" ", parts);
    }
}
~~~
@why
`NullReferenceException` — это не «баг в строке 14», а пропущенный вопрос: *«а может ли здесь быть null?»*. Закрывай его на границах (`null`-проверка аргумента) и используй `IsNullOrWhiteSpace` вместо ручных проверок.
:::

:::ticket Рефакторинг: три копии расчёта цены
@key SHOP-40
@type Refactor
@prio Medium
@reporter Макс (TL)
@labels рефакторинг, DRY
@xp 90
@minscore 92
@task
В `Pricing` три метода почти слово в слово повторяют одну формулу, отличается только коэффициент скидки клиента. Бизнес просит добавить четвёртый тип клиента, и это уже третья правка в трёх местах за месяц.

**Задача:** убери дублирование, **не меняя результат**. Публичные методы `RegularPrice`, `VipPrice`, `EmployeePrice` должны остаться (они вызываются из десятков мест). Ревью должно быть почти чистым.
@comment Макс (TL): Если после рефакторинга снова будет копипаста — верну. Общую формулу вынеси в один приватный метод.
@code
~~~csharp
using System;

public static class Pricing
{
    public static decimal RegularPrice(decimal basePrice, int qty)
    {
        decimal total = basePrice * qty;
        if (qty >= 10) total = total * 0.9m;
        if (total > 1000m) total = total - 50m;
        return Math.Round(total, 2);
    }

    public static decimal VipPrice(decimal basePrice, int qty)
    {
        decimal total = basePrice * qty * 0.85m;
        if (qty >= 10) total = total * 0.9m;
        if (total > 1000m) total = total - 50m;
        return Math.Round(total, 2);
    }

    public static decimal EmployeePrice(decimal basePrice, int qty)
    {
        decimal total = basePrice * qty * 0.7m;
        if (qty >= 10) total = total * 0.9m;
        if (total > 1000m) total = total - 50m;
        return Math.Round(total, 2);
    }
}
~~~
@tests
~~~csharp
class T
{
    public static void Run()
    {
        Assert.Equal(300m, Pricing.RegularPrice(100m, 3), "regular: 3×100");
        Assert.Equal(900m, Pricing.RegularPrice(100m, 10), "regular: от 10 штук −10%");
        Assert.Equal(1150m, Pricing.RegularPrice(1200m, 1), "regular: свыше 1000 — минус 50");
        Assert.Equal(100m, Pricing.RegularPrice(33.333m, 3), "округление до копеек");
        Assert.Equal(255m, Pricing.VipPrice(100m, 3), "vip: −15%");
        Assert.Equal(765m, Pricing.VipPrice(100m, 10), "vip + оптовая скидка");
        Assert.Equal(1650m, Pricing.VipPrice(2000m, 1), "vip: большой заказ");
        Assert.Equal(210m, Pricing.EmployeePrice(100m, 3), "сотрудник: −30%");
        Assert.Equal(630m, Pricing.EmployeePrice(100m, 10), "сотрудник + оптовая");
    }
}
~~~
@hint
Вынеси общую часть в `private static decimal Calc(decimal basePrice, int qty, decimal customerFactor)`, а публичные методы пусть вызывают её со своим коэффициентом (`1m`, `0.85m`, `0.7m`).
@solution
~~~csharp
using System;

public static class Pricing
{
    private const decimal BulkFactor = 0.9m;
    private const int BulkQty = 10;
    private const decimal BigOrderLimit = 1000m;
    private const decimal BigOrderBonus = 50m;

    public static decimal RegularPrice(decimal basePrice, int qty) => Calc(basePrice, qty, 1m);
    public static decimal VipPrice(decimal basePrice, int qty) => Calc(basePrice, qty, 0.85m);
    public static decimal EmployeePrice(decimal basePrice, int qty) => Calc(basePrice, qty, 0.7m);

    private static decimal Calc(decimal basePrice, int qty, decimal customerFactor)
    {
        decimal total = basePrice * qty * customerFactor;
        if (qty >= BulkQty) total *= BulkFactor;
        if (total > BigOrderLimit) total -= BigOrderBonus;
        return Math.Round(total, 2);
    }
}
~~~
@why
Дублирование — это не про «некрасиво»: правило скидок теперь живёт в **одном** месте. Бонус: магические числа получили имена (`BulkQty`, `BigOrderLimit`) — читается как документация.
:::


@@append id="p1-project"
## Код-ревью чужого легаси {#lab}

Перед стартом проекта разбери «наследие» — типичный банковский код, который написан без инвариантов. Ответь: какие проблемы **твой** проект должен исключить с самого начала?

:::legacy Банк «Классик»: перевод между счетами
@context Модуль работает уже 6 лет. Жалобы: «иногда деньги пропадают при переводе», «в отчёте не сходятся копейки», «после перезапуска суммы разные».
@code
~~~csharp
public class Bank
{
    public static double Total = 0;
    public List<Account> Accounts = new List<Account>();

    public void Transfer(string from, string to, double amount)
    {
        var a = Accounts.Find(x => x.Id == from);
        var b = Accounts.Find(x => x.Id == to);
        a.Balance -= amount;
        b.Balance += amount;
        Total += amount;
    }

    public double GetBalance(string id)
    {
        try
        {
            return Accounts.Find(x => x.Id == id).Balance;
        }
        catch
        {
            return -1;
        }
    }
}
~~~
@bug 3 | [design] Публичное изменяемое статическое поле | Глобальное состояние, к которому тянется любой код; тесты влияют друг на друга; при параллельных вызовах значение портится. Состояние должно принадлежать экземпляру и быть закрытым.
@bug 4 | [design] Публичный список счетов | Любой клиентский код может обойти `Bank` и править балансы напрямую — инвариант «деньги не появляются из воздуха» никто не охраняет.
@bug 6 | [data] `double amount` для денег | Двоичная плавающая точка накапливает ошибки округления — отсюда «не сходятся копейки». Деньги — `decimal`.
@bug 8-9 | [bug] `Find` может вернуть null | Если счёта нет — `NullReferenceException` на следующей строке. Должна быть понятная доменная ошибка («счёт не найден»).
@bug 10-11 | [bug] Перевод не атомарен и без проверок | Сначала списали, потом (возможно) упали на `b == null` — деньги исчезли. Нет проверок: сумма > 0, достаточно средств, счёт-отправитель ≠ получателю.
@bug 12 | [race] `Total += amount` не потокобезопасно | Чтение-изменение-запись без синхронизации — при параллельных переводах часть прибавок теряется (`Interlocked`/`lock`).
@bug 21-24 | [bug] Голый `catch` и «магический» `-1` | Прячет любые ошибки, а `-1` вполне допустим как баланс овердрафта: вызывающий код не может отличить сбой от результата.
@fixed
~~~csharp
public class Bank
{
    private readonly Dictionary<string, Account> _accounts = new();
    private readonly object _gate = new();

    public void Transfer(string from, string to, decimal amount)
    {
        if (amount <= 0) throw new ArgumentException("Сумма должна быть положительной");
        if (from == to) throw new ArgumentException("Нельзя переводить на тот же счёт");
        lock (_gate)
        {
            var a = Get(from);
            var b = Get(to);
            if (a.Balance < amount) throw new InvalidOperationException("Недостаточно средств");
            a.Withdraw(amount);   // проверки инвариантов — внутри Account
            b.Deposit(amount);
        }
    }

    public decimal GetBalance(string id) => Get(id).Balance;

    private Account Get(string id) =>
        _accounts.TryGetValue(id, out var acc) ? acc : throw new KeyNotFoundException("Счёт не найден: " + id);
}
~~~
:::

:::interview Деньги в double
@q Почему нельзя хранить деньги в `double`? Что выведет `Console.WriteLine(0.1 + 0.2 == 0.3);`?
@trap Знает ли кандидат, **почему** (двоичное представление), а не только «так говорят». Видит ли последствия — накопление ошибок, сравнения.
@answer
Выведет `False`. `double` — двоичная дробь стандарта IEEE-754; числа вроде 0.1 и 0.2 не имеют точного двоичного представления (как 1/3 в десятичной), поэтому результат — `0.30000000000000004`. Для денег используют `decimal` (десятичная арифметика, 28–29 значащих цифр) или целые копейки (`long`). Сравнивать double нужно с допуском: `Math.Abs(a - b) < 1e-9`.
@fail «Потому что double — неточный тип». Это пересказ без причины; интервьюер спросит «почему именно неточный?».
@follow В чём цена `decimal`? (Медленнее и больше по размеру, но точен для десятичных дробей; не подходит для научных расчётов.)
:::

:::cards Проект фазы 1: что охранять с первого дня
Инвариант баланса :: Баланс ≥ 0 — меняется только через Deposit/Withdraw, наружу только чтение.
Деньги :: decimal (или long-копейки), никогда double.
Операция «перевод» :: Атомарна: проверки до изменений; ошибки — доменные исключения с понятным текстом.
Публичные коллекции :: Не отдавай изменяемый список наружу — IReadOnlyList или копия.
:::


@@append id="p1"
## Итоговый тест фазы 1 {#lab}

Перед закрытием фазы пройди сквозной квиз: вопросы собраны из всех тем и построены на понимании, а не на заучивании.

:::quiz Итог фазы 1: память, ООП, исключения
? Что выведет код? #memory
| struct S { public int V; public void Inc() { V++; } }
| var s = new S();
| s.Inc();
| var list = new List<S> { s };
| list[0].Inc();   // (мысленно: вызов на копии)
| Console.WriteLine(s.V);
+ 1
- 0
- 2
- Ошибка компиляции
= `s.Inc()` меняет локальную переменную `s` → `V = 1`. В список кладётся **копия**, `list[0].Inc()` меняет копию (на практике компилятор для вызова метода на результате индексатора создаёт временную копию). Оригинал остаётся 1.

? Какая сложность у цикла `for` по `List<string>` с `s += item` на N элементов? #bigo
- O(N)
+ O(N²) по символам (копирование растущей строки)
- O(log N)
- O(1)
= Каждая итерация копирует накопленную строку. Решение — `StringBuilder` или `string.Join`.

? Что произойдёт? #net
| object o = 3;
| long l = (long)o;
- l = 3
- Ошибка компиляции
+ InvalidCastException на этапе выполнения
- l = 0
= В коробке лежит `int`. Распаковка возможна только в `int` (или `int?`). Нужно: `(long)(int)o`.

? Что вернёт `a.Speak()`? #oop
| class Animal { public virtual string Speak() => "..."; }
| class Dog : Animal { public override string Speak() => "Гав"; }
| class Puppy : Dog { public new string Speak() => "Тяф"; }
| Animal a = new Puppy();
+ Гав
- Тяф
- ...
- Ошибка компиляции
= У `Puppy` метод **скрывает** (`new`), а не переопределяет. Вызов по типу `Animal` идёт по виртуальной таблице: ближайший `override` — в `Dog` → «Гав».

? Почему нельзя делать `public decimal Balance;` в банковском классе? #oop
- Это медленно
- Это не компилируется
+ Нет места для проверки инварианта: любой код может записать невалидное значение
- Поле нельзя читать снаружи
= Инкапсуляция — это не «скрыть данные», а «охранять правила». Свойство с `private set` и методы с проверками.

? Какая запись в `catch` теряет исходный стек вызовов? #lang
- `throw;`
- `throw new MyEx("msg", ex);`
+ `throw ex;`
- `ExceptionDispatchInfo.Capture(ex).Throw();`
= `throw ex;` начинает трассу заново с этой строки.

? Чем интерфейс отличается от абстрактного класса при выборе дизайна? #oop
+ Интерфейс — контракт без состояния (можно реализовать много); абстрактный класс — общий код и состояние, но одно наследование
- Ничем
- Интерфейс быстрее
- Абстрактный класс нельзя тестировать
= Выбирай интерфейс для контракта/зависимостей, абстрактный класс — когда есть реальный общий код наследников.

? Что произойдёт при `int.MaxValue + 1` в обычном (unchecked) контексте? #lang
- Исключение
+ Результат станет int.MinValue
- Компилятор не соберёт программу
- Результат — double
= Целое переполнение молча заворачивается. Для критичных вычислений — `checked`.
:::

:::interview Struct против class
@q Чем отличаются `struct` и `class` в C#, и когда вы выберете структуру?
@trap Не «структура в стеке, класс в куче» (это упрощение, которое ломается: struct-поле класса лежит в куче!), а семантика **значения против ссылки**, копирование, наследование и стоимость.
@answer
Структура — значимый тип: при присваивании и передаче в метод копируются данные; у класса копируется ссылка. Структуры не наследуются (но реализуют интерфейсы), по умолчанию нет `null`, нет финализаторов. Где лежит — зависит от контекста: локальная переменная — в стеке/регистре, поле класса — внутри объекта в куче, элемент массива — внутри массива. Выбираю структуру для **маленьких, неизменяемых, короткоживущих** значений (≤ 16 байт, как `Point`, `DateTime`), и делаю её `readonly struct`. Большие или изменяемые данные — класс.
@fail «Struct всегда в стеке» — неверно: struct внутри класса или массива живёт в куче; а упаковка в `object` создаёт коробку.
@follow Почему изменяемые структуры опасны? (Легко изменить копию; `foreach`-переменная и индексатор списка отдают копию.)
:::

:::interview Что делает finally
@q Что напечатает метод и что вернёт: `try { return Log("try"); } finally { Log("finally"); }`? Всегда ли выполняется finally?
@trap Понимание порядка: значение для `return` вычисляется до `finally`; а ещё — исключения из `finally`, `Environment.FailFast`, StackOverflow и убийство процесса.
@answer
Сначала выполнится `Log("try")` (значение вычислено), потом `finally`, затем метод вернёт ранее вычисленное значение. `finally` выполняется при нормальном завершении, `return`, `throw`, `break`/`continue` из `try`. Не выполнится при падении процесса (`Environment.FailFast`, `StackOverflowException`, kill, отключение питания). Нельзя делать `return` внутри `finally` (в C# запрещено), а исключение из `finally` перекроет исходное.
@fail «Finally выполняется всегда, без исключений» — нужна оговорка про аварийное завершение процесса.
:::

:::interview Что такое GC и поколения
@q Расскажи, как работает сборщик мусора в .NET. Зачем поколения?
@trap Знает ли кандидат модель достижимости (а не подсчёт ссылок) и эвристику «большинство объектов умирает молодыми».
@answer
GC освобождает объекты, **недостижимые из корней** (стек, статики, регистры). Алгоритм: пометить достижимых (mark), найти мёртвых, при необходимости уплотнить кучу (compact). Куча делится на поколения 0/1/2 и LOH для больших объектов: новые объекты почти всегда умирают быстро, поэтому часто собирается маленькое Gen 0 — это дёшево, а полную сборку Gen 2 стараются делать редко. Выжившие повышаются в старшее поколение. Во время сборки потоки приостанавливаются (в фоновом режиме Gen 2 может идти параллельно).
@fail «GC считает ссылки на объект и удаляет те, где счётчик 0» — это подсчёт ссылок, в .NET он не используется (отсюда возможна сборка циклических ссылок).
@follow Что такое утечка памяти в управляемом языке? (Объект остаётся достижимым: событие, статическая коллекция, кэш без вытеснения.)
:::

:::cards Фаза 1: минимум
Value type vs reference type :: Значение копируется целиком / копируется ссылка. struct, enum, примитивы — значимые; class, string, массивы, делегаты — ссылочные.
Stack vs heap :: Стек — кадры вызовов; куча — объекты под управлением GC. Где лежит struct — зависит от контекста.
Инвариант :: Правило, которое класс обязан соблюдать всегда; охраняется конструктором и методами.
Fail fast :: Проверяй аргументы и бросай исключение сразу, пока объект ещё цел.
:::
