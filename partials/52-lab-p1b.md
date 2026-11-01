@@append id="p1-strings"
## Закрепление {#lab}

:::viz heap string
:::

:::quiz Строки
? Что выведет код? #net
| var s = "hello";
| s.ToUpper();
| Console.WriteLine(s);
- HELLO
+ hello
- Ошибка компиляции
- null
= Строки неизменяемы: `ToUpper()` возвращает **новую** строку, исходная не меняется. Результат нужно присвоить: `s = s.ToUpper();`.

? Сколько объектов-строк создаст `s += "x"` в цикле на N итераций (грубо) и какова сложность? #bigo
- 1 объект, O(N)
- N объектов, O(N)
+ N объектов, суммарно O(N²) копирований символов
- 2 объекта, O(1)
= Каждая итерация копирует всю накопленную строку в новую. `StringBuilder` растит буфер амортизированно — O(N) в сумме.

? Что такое интернирование строк? #net
- Шифрование строк
+ Хранение одной копии одинаковых строковых литералов в общем пуле
- Автоматическое сжатие строк GC
- Преобразование строки в число
= Одинаковые литералы в коде указывают на один объект в intern-пуле. Строки, созданные во время выполнения, туда сами не попадают (можно вручную: `string.Intern`).

? Как правильно сравнивать строки без учёта регистра? #lang
- `a.ToLower() == b.ToLower()`
+ `string.Equals(a, b, StringComparison.OrdinalIgnoreCase)`
- `a == b.ToUpper()`
- `a.Contains(b)`
= `ToLower()` создаёт лишние строки и ломается на культурах (например, турецкая «İ»). Явный `StringComparison` — быстро и корректно.
:::

:::compare Сборка строки в цикле
@intro Результат одинаковый — цена разная.
@bad
~~~csharp
using System;
string result = "";
for (int i = 0; i < 6; i++)
{
    result += i + ",";
}
Console.WriteLine(result);
~~~
@badwhy
Каждое `+=` создаёт новую строку и копирует предыдущую. На 100 000 итераций это сотни мегабайт копирований и тысячи объектов мусора.
@good
~~~csharp
using System;
using System.Text;
var sb = new StringBuilder();
for (int i = 0; i < 6; i++)
{
    sb.Append(i).Append(',');
}
Console.WriteLine(sb.ToString());
~~~
@goodwhy
`StringBuilder` держит растущий буфер и дописывает в него. В конце один вызов `ToString()`. Для простой склейки коллекции есть ещё `string.Join(",", items)`.
@run
:::

:::ide Сжатие строки (RLE)
@xp 50
@task
Реализуй `Solver.Compress(string s)`: подряд идущие одинаковые символы заменяются на символ и количество. `"aaabcc"` → `"a3b1c2"`. Пустая строка → пустая. Собирай результат через `StringBuilder`.
@code
~~~csharp
using System;
using System.Text;

public static class Solver
{
    public static string Compress(string s)
    {
        // TODO
        return s;
    }
}

class Program
{
    static void Main() => Console.WriteLine(Solver.Compress("aaabcc"));
}
~~~
@tests
~~~csharp
class T
{
    public static void Run()
    {
        Assert.Equal("", Solver.Compress(""), "пустая строка");
        Assert.Equal("a1", Solver.Compress("a"), "один символ");
        Assert.Equal("a3b1c2", Solver.Compress("aaabcc"), "aaabcc");
        Assert.Equal("a1b1c1", Solver.Compress("abc"), "без повторов");
        Assert.Equal("x5", Solver.Compress("xxxxx"), "одинаковые");
    }
}
~~~
@require StringBuilder => Условие: собирай результат через StringBuilder
@hint
Иди по строке, считай длину текущей «серии». Когда символ сменился (или строка кончилась) — допиши в builder символ и счётчик.
@solution
~~~csharp
using System;
using System.Text;

public static class Solver
{
    public static string Compress(string s)
    {
        if (string.IsNullOrEmpty(s)) return "";
        var sb = new StringBuilder();
        char cur = s[0];
        int count = 1;
        for (int i = 1; i < s.Length; i++)
        {
            if (s[i] == cur) { count++; continue; }
            sb.Append(cur).Append(count);
            cur = s[i];
            count = 1;
        }
        sb.Append(cur).Append(count);
        return sb.ToString();
    }
}
~~~
@why
Классическая схема «серий»: флашим накопленное при смене символа **и после цикла** — забытый хвост (последняя серия) — самая частая ошибка в этой задаче.
:::

:::cards Строки
Почему string неизменяема :: Потокобезопасность, безопасное кэширование хэша, интернирование; цена — копирование при каждом изменении.
StringBuilder :: Изменяемый буфер символов: Append амортизированно O(1). Используй для сборки строки в цикле.
Сравнение без регистра :: string.Equals(a, b, StringComparison.OrdinalIgnoreCase) — без лишних аллокаций.
Интернирование :: Общий пул одинаковых литералов; string.Intern(s) добавляет строку в пул вручную.
string.Join vs += :: Join собирает за один проход и одну аллокацию результата; += в цикле — O(N²).
:::


@@append id="p1-encapsulation"
## Закрепление {#lab}

:::quiz Инкапсуляция
? Какой модификатор доступа у члена класса, если ничего не указано? #oop
- public
- internal
+ private
- protected
= Для членов класса по умолчанию `private`. (Для самого типа верхнего уровня — `internal`.)

? Что гарантирует `readonly`-поле? #oop
- Что объект нельзя изменить вообще
+ Что поле можно присвоить только в объявлении или в конструкторе
- Что значение неизменяемо во всех потоках
- Что поле не попадёт в GC
= `readonly` защищает **саму ссылку/значение поля**, а не содержимое объекта: `readonly List<int>` всё ещё можно наполнять.

? Зачем вместо публичного поля — свойство? #oop
- Это быстрее
- Так принято, и всё
+ Можно проверять инварианты и менять реализацию, не ломая клиентов
- Свойства занимают меньше памяти
= Свойство — это контракт. Поле не умеет валидировать присвоение, а смена «поле → свойство» ломает бинарную совместимость.
:::

:::compare Публичное поле против инварианта
@bad
~~~csharp
using System;
class Account
{
    public decimal Balance;
}
var a = new Account { Balance = 100m };
a.Balance = -500m;
Console.WriteLine(a.Balance);
~~~
@badwhy
Объект можно привести в невалидное состояние одной строкой: баланс −500. Проверок нет, и их негде добавить.
@good
~~~csharp
using System;
class Account
{
    public decimal Balance { get; private set; }
    public Account(decimal initial)
    {
        if (initial < 0) throw new ArgumentException("Начальный баланс не может быть отрицательным");
        Balance = initial;
    }
    public void Withdraw(decimal amount)
    {
        if (amount <= 0) throw new ArgumentException("Сумма должна быть положительной");
        if (amount > Balance) throw new InvalidOperationException("Недостаточно средств");
        Balance -= amount;
    }
}
var a = new Account(100m);
try { a.Withdraw(500m); }
catch (InvalidOperationException e) { Console.WriteLine(e.Message); }
Console.WriteLine(a.Balance);
~~~
@goodwhy
Состояние меняется только через методы, которые охраняют **инвариант** («баланс ≥ 0»). Невалидный объект создать невозможно.
@run
:::

:::ide Счёт с инвариантом
@xp 60
@task
Доработай `BankAccount`: баланс должен читаться снаружи, но **изменяться только методами**.

- конструктор: начальный баланс не может быть отрицательным (`ArgumentException`);
- `Deposit(amount)`: `amount > 0`, иначе `ArgumentException`;
- `Withdraw(amount)`: `amount > 0` (иначе `ArgumentException`) и не больше баланса (иначе `InvalidOperationException`).
@code
~~~csharp
using System;

public class BankAccount
{
    public decimal Balance;

    public BankAccount(decimal initial)
    {
        Balance = initial;
    }

    public void Deposit(decimal amount)
    {
        Balance += amount;
    }

    public void Withdraw(decimal amount)
    {
        Balance -= amount;
    }
}
~~~
@tests
~~~csharp
class T
{
    public static void Run()
    {
        var acc = new BankAccount(100m);
        acc.Deposit(50m);
        Assert.Equal(150m, acc.Balance, "Deposit увеличивает баланс");
        acc.Withdraw(30m);
        Assert.Equal(120m, acc.Balance, "Withdraw уменьшает баланс");
        Assert.Throws<ArgumentException>(() => new BankAccount(-1m), "отрицательный старт");
        Assert.Throws<ArgumentException>(() => acc.Deposit(0m), "Deposit(0)");
        Assert.Throws<ArgumentException>(() => acc.Withdraw(-5m), "Withdraw(-5)");
        Assert.Throws<InvalidOperationException>(() => acc.Withdraw(1000m), "перерасход");
        Assert.Equal(120m, acc.Balance, "после ошибок баланс не изменился");
    }
}
~~~
@forbid public\s+decimal\s+Balance\s*; => Баланс не должен быть публичным полем
@forbid set\s*;(?!\s*\})|\{\s*get;\s*set; => Публичный сеттер у Balance запрещён: используй private set
@hint
`public decimal Balance { get; private set; }` — читать можно всем, писать — только внутри класса.
@hint
Каждый метод сначала проверяет аргументы (бросает исключение), и только потом меняет состояние.
@solution
~~~csharp
using System;

public class BankAccount
{
    public decimal Balance { get; private set; }

    public BankAccount(decimal initial)
    {
        if (initial < 0) throw new ArgumentException("Начальный баланс не может быть отрицательным");
        Balance = initial;
    }

    public void Deposit(decimal amount)
    {
        if (amount <= 0) throw new ArgumentException("Сумма должна быть положительной");
        Balance += amount;
    }

    public void Withdraw(decimal amount)
    {
        if (amount <= 0) throw new ArgumentException("Сумма должна быть положительной");
        if (amount > Balance) throw new InvalidOperationException("Недостаточно средств");
        Balance -= amount;
    }
}
~~~
@why
Принцип: **объект всегда валиден**. Проверяй аргументы до изменения состояния — тогда после исключения объект остаётся целым (см. последнюю проверку теста).
:::

:::cards Инкапсуляция
Инвариант :: Условие, которое должно быть истинно для объекта всегда (например, баланс ≥ 0). Класс обязан его охранять.
private set :: Читать свойство можно снаружи, менять — только внутри класса.
readonly vs const :: const — константа времени компиляции; readonly — присваивается в объявлении или конструкторе.
init-свойство :: Можно задать только при создании объекта (инициализатор), затем неизменяемо.
:::


@@append id="p1-inheritance"
## Закрепление {#lab}

:::quiz Наследование и полиморфизм
? Что напечатает программа? #oop
| class A { public virtual string Hi() => "A"; }
| class B : A { public override string Hi() => "B"; }
| A x = new B();
| Console.WriteLine(x.Hi());
- A
+ B
- Ошибка компиляции
- AB
= `virtual` + `override` = динамический полиморфизм: метод выбирается по **фактическому** типу объекта (B).

? В каком порядке выполняется код при `new D()`, если `D : B : A` и у всех есть конструкторы? #oop
- D → B → A
+ A → B → D (сначала базовые конструкторы)
- B → A → D
- Порядок не определён
= Сначала выполняется конструктор базового класса, затем производного. Инициализаторы полей производного класса выполняются **до** конструктора базового.

? Что произойдёт, если в конструкторе базового класса вызвать виртуальный метод? #oop
- Ничего особенного
+ Вызовется переопределение из производного класса, у которого поля ещё не инициализированы конструктором
- Ошибка компиляции
- Вызовется базовая версия
= Классическая ловушка: производный `override` отработает на частично созданном объекте. Не вызывай виртуальные методы из конструкторов.

? Чем `new`-скрытие метода отличается от `override`? #oop
- Ничем
+ Скрытый метод вызывается по статическому типу переменной, а не по фактическому типу объекта
- `new` работает только для свойств
- `override` разрешён без `virtual`
= При скрытии полиморфизма нет: `Animal a = new Dog(); a.Speak()` вызовет метод `Animal`.
:::

:::ide Полиморфизм вместо if (is ...)
@xp 55
@task
Есть иерархия фигур. Реализуй `Area()` в `Circle` и `Rect`, а `Solver.TotalArea` должен просто складывать площади, **не проверяя типы** (никаких `is`, `as`, `GetType`). Добавление новой фигуры не должно менять `TotalArea`.
@code
~~~csharp
using System;
using System.Collections.Generic;

public abstract class Shape
{
    public abstract double Area();
}

public class Circle : Shape
{
    public double R { get; }
    public Circle(double r) { R = r; }
}

public class Rect : Shape
{
    public double W { get; }
    public double H { get; }
    public Rect(double w, double h) { W = w; H = h; }
}

public static class Solver
{
    public static double TotalArea(IEnumerable<Shape> shapes)
    {
        // TODO
        return 0;
    }
}
~~~
@tests
~~~csharp
class T
{
    class Square : Shape
    {
        public double S;
        public Square(double s) { S = s; }
        public override double Area() => S * S;
    }

    public static void Run()
    {
        Assert.Equal(12.57, Math.Round(new Circle(2).Area(), 2), "площадь круга r=2");
        Assert.Equal(6.0, new Rect(2, 3).Area(), "площадь прямоугольника");
        var all = new List<Shape> { new Rect(2, 3), new Circle(1), new Square(2) };
        Assert.Equal(13.14, Math.Round(Solver.TotalArea(all), 2), "TotalArea для смеси фигур, включая новую");
        Assert.Equal(0.0, Solver.TotalArea(new List<Shape>()), "пустой список");
    }
}
~~~
@forbid \bis\s+\w|\bas\s+\w|GetType|typeof => Условие: никакой проверки типов — только полиморфизм
@hint
Метод `Area()` в каждом наследнике помечается `override`. Тогда `shape.Area()` сам выберет нужную формулу.
@solution
~~~csharp
using System;
using System.Collections.Generic;

public abstract class Shape
{
    public abstract double Area();
}

public class Circle : Shape
{
    public double R { get; }
    public Circle(double r) { R = r; }
    public override double Area() => Math.PI * R * R;
}

public class Rect : Shape
{
    public double W { get; }
    public double H { get; }
    public Rect(double w, double h) { W = w; H = h; }
    public override double Area() => W * H;
}

public static class Solver
{
    public static double TotalArea(IEnumerable<Shape> shapes)
    {
        double total = 0;
        foreach (var s in shapes) total += s.Area();
        return total;
    }
}
~~~
@why
Это и есть принцип Open/Closed: класс `Square` из теста появился **после** `TotalArea` — и всё работает без правок. Цепочка `if (s is Circle) … else if (s is Rect) …` пришлось бы дописывать при каждой новой фигуре.
:::

:::ticket NullReferenceException при создании кнопки
@key UI-57
@type Bug
@prio Highest
@reporter Дима (фронтенд)
@labels наследование, конструктор
@xp 90
@task
**Шаги:** `new Button("save")` падает с `NullReferenceException`. Базовый класс `Widget` в конструкторе вызывает абстрактный метод `Render()`, а в `Button` подпись хранится в поле, которое присваивается в конструкторе `Button` — **после** конструктора базового класса.

**Ожидается:** создание виджета ничего не рисует и не падает; рисование — отдельным публичным вызовом `Show()`. Публичный API (`Button(string)`, `Show()`) менять нельзя.
@comment Макс (TL): Не пытайся «подвинуть» присваивание поля — это маскирует симптом. Причина: виртуальный вызов из конструктора. Убери его.
@code
~~~csharp
using System;
using System.Collections.Generic;

public static class Log
{
    public static List<string> Lines = new List<string>();
}

public abstract class Widget
{
    public string Name { get; }
    protected Widget(string name)
    {
        Name = name;
        Render();
    }
    protected abstract void Render();
}

public class Button : Widget
{
    private string _caption;
    public Button(string caption) : base("button")
    {
        _caption = caption;
    }
    protected override void Render() => Log.Lines.Add("Render " + _caption.ToUpper());
}
~~~
@tests
~~~csharp
class T
{
    public static void Run()
    {
        Log.Lines.Clear();
        var b = new Button("save");
        Assert.Equal(0, Log.Lines.Count, "конструктор ничего не рисует");
        Assert.Equal("button", b.Name, "имя задано");
        b.Show();
        Assert.Equal(1, Log.Lines.Count, "Show() рисует один раз");
        Assert.Equal("Render SAVE", Log.Lines[0], "содержимое отрисовки");
    }
}
~~~
@hint
Конструктор `Widget` должен только сохранить имя. Добавь в `Widget` публичный метод `Show()`, который вызывает `Render()`.
@solution
~~~csharp
using System;
using System.Collections.Generic;

public static class Log
{
    public static List<string> Lines = new List<string>();
}

public abstract class Widget
{
    public string Name { get; }
    protected Widget(string name)
    {
        Name = name;
    }
    public void Show() => Render();
    protected abstract void Render();
}

public class Button : Widget
{
    private string _caption;
    public Button(string caption) : base("button")
    {
        _caption = caption;
    }
    protected override void Render() => Log.Lines.Add("Render " + _caption.ToUpper());
}
~~~
@why
Порядок в C#: инициализаторы полей производного → конструктор базового → тело конструктора производного. Виртуальный вызов в базовом конструкторе попадает в `override`, пока производный **ещё не достроен**. Правило: в конструкторах не вызывай виртуальные методы.
:::

:::compare Ветвление по типу против полиморфизма
@bad
~~~csharp
using System;
abstract class Notification { }
class Email : Notification { public string To = "a@b.c"; }
class Sms : Notification { public string Phone = "+700"; }
class Push : Notification { public string Token = "tok"; }
static string Send(Notification n)
{
    if (n is Email e) return "mail to " + e.To;
    else if (n is Sms s) return "sms to " + s.Phone;
    else if (n is Push p) return "push to " + p.Token;
    else throw new NotSupportedException();
}
Console.WriteLine(Send(new Email()));
Console.WriteLine(Send(new Sms()));
~~~
@badwhy
Каждый новый тип уведомления — правка этого `if` (и всех таких мест по коду). Нарушение Open/Closed: класс открыт для изменения вместо расширения.
@good
~~~csharp
using System;
abstract class Notification { public abstract string Send(); }
class Email : Notification { public string To = "a@b.c"; public override string Send() => "mail to " + To; }
class Sms : Notification { public string Phone = "+700"; public override string Send() => "sms to " + Phone; }
class Push : Notification { public string Token = "tok"; public override string Send() => "push to " + Token; }
Console.WriteLine(new Email().Send());
Console.WriteLine(new Sms().Send());
~~~
@goodwhy
Поведение живёт в самом типе. Новый вид уведомления — новый класс, без правок существующего кода.
@run
:::

:::cards Наследование
virtual / override :: virtual разрешает переопределение; override переопределяет — динамическая диспетчеризация по фактическому типу.
new (hiding) :: Скрывает член базового класса; вызов определяется по статическому типу переменной — полиморфизма нет.
Порядок конструкторов :: Инициализаторы полей производного → конструктор базового → конструктор производного.
abstract :: Нельзя создать экземпляр; обязывает наследников реализовать abstract-члены.
sealed :: Запрещает наследование от класса или дальнейшее переопределение метода.
:::


@@append id="p1-interfaces"
## Закрепление {#lab}

:::quiz Интерфейсы и абстрактные классы
? Что можно, а что нельзя в интерфейсе (C# 8+)? #oop
- Нельзя ничего, кроме сигнатур
+ Можно реализацию по умолчанию, но нельзя поля с состоянием экземпляра
- Можно всё, как в классе
- Можно только константы
= Default interface methods появились в C# 8, но состояние экземпляра (поля) в интерфейсе по-прежнему запрещено.

? Когда лучше абстрактный класс, а не интерфейс? #oop
+ Когда нужен общий код/состояние для наследников
- Когда нужна множественная реализация
- Когда нужен мок в тесте
- Когда нужен контракт без реализации
= Абстрактный класс — «частичная реализация» с состоянием, но наследоваться можно только от одного. Интерфейсов можно реализовать сколько угодно.

? Почему классу выгоднее зависеть от `ILogger`, а не от `FileLogger`? #oop
- Интерфейсы быстрее
+ Реализацию можно подменить (тест, другой логгер) без изменения самого класса
- FileLogger нельзя наследовать
- Так требует компилятор
= Это принцип инверсии зависимостей (DIP): зависим от абстракции, а не от конкретной реализации.
:::

:::ide Внедряем зависимость
@xp 60
@task
`OrderService` сам создаёт `EmailNotifier` через `new` — поэтому его нельзя проверить в тесте без отправки настоящей почты. Сделай так, чтобы зависимость **передавалась через конструктор** как интерфейс `INotifier`. После этого сервис можно тестировать «пустышкой».
@code
~~~csharp
using System;
using System.Collections.Generic;

public interface INotifier
{
    void Notify(string message);
}

public class EmailNotifier : INotifier
{
    public void Notify(string message) => Console.WriteLine("Отправлено письмо: " + message);
}

public class OrderService
{
    private readonly EmailNotifier _notifier = new EmailNotifier();

    public void Place(string orderId)
    {
        _notifier.Notify("Заказ " + orderId + " оформлен");
    }
}

class Program
{
    static void Main() => new OrderService().Place("A-1");
}
~~~
@tests
~~~csharp
class T
{
    class FakeNotifier : INotifier
    {
        public List<string> Sent = new List<string>();
        public void Notify(string message) => Sent.Add(message);
    }

    public static void Run()
    {
        var fake = new FakeNotifier();
        var svc = new OrderService(fake);
        svc.Place("A-1");
        Assert.Equal(1, fake.Sent.Count, "отправлено одно уведомление");
        Assert.Equal("Заказ A-1 оформлен", fake.Sent[0], "текст уведомления");
        Assert.Throws<ArgumentNullException>(() => new OrderService(null), "null-зависимость отвергается");
    }
}
~~~
@forbid new\s+EmailNotifier\s*\(\)\s*[;)]\s*(?=[\s\S]*class\s+Program)(?![\s\S]*static void Main) => Служебное правило
@hint
Поле должно иметь тип интерфейса: `private readonly INotifier _notifier;` — и заполняться из параметра конструктора. Не забудь проверку на `null`.
@solution
~~~csharp
using System;
using System.Collections.Generic;

public interface INotifier
{
    void Notify(string message);
}

public class EmailNotifier : INotifier
{
    public void Notify(string message) => Console.WriteLine("Отправлено письмо: " + message);
}

public class OrderService
{
    private readonly INotifier _notifier;

    public OrderService(INotifier notifier)
    {
        _notifier = notifier ?? throw new ArgumentNullException(nameof(notifier));
    }

    public void Place(string orderId)
    {
        _notifier.Notify("Заказ " + orderId + " оформлен");
    }
}

class Program
{
    static void Main() => new OrderService(new EmailNotifier()).Place("A-1");
}
~~~
@why
`new` внутри класса «приклеивает» его к конкретной реализации. Принимая интерфейс через конструктор (**constructor injection**), мы получаем тестируемость и свободу замены. В ASP.NET Core этим занимается DI-контейнер — ты увидишь это в Фазе 4.
:::

:::cards Интерфейсы
Интерфейс :: Контракт: что умеет тип. Реализаций может быть много, наследоваться можно от нескольких интерфейсов.
Абстрактный класс :: Частичная реализация + состояние; наследуется только один.
DIP :: Dependency Inversion: зависим от абстракций, а не от конкретных классов. Реализацию подставляют снаружи.
Явная реализация интерфейса :: `void IFoo.Bar()` — метод доступен только через ссылку типа интерфейса.
:::


@@append id="p1-exceptions"
## Закрепление {#lab}

:::quiz Исключения
? Что напечатает программа? #lang
| static int F()
| {
|     try { return 1; }
|     finally { Console.WriteLine("finally"); }
| }
| Console.WriteLine(F());
- 1
+ finally, затем 1
- 1, затем finally
- Только finally
= `finally` выполняется даже при `return` внутри `try`: сначала вычисляется возвращаемое значение, затем отрабатывает `finally`, и только потом метод возвращает управление.

? В чём разница между `throw;` и `throw ex;` в блоке catch? #lang
+ `throw;` сохраняет исходный stack trace, `throw ex;` перезаписывает его
- Никакой
- `throw;` создаёт новое исключение
- `throw ex;` не работает внутри catch
= `throw;` пробрасывает то же исключение с исходным стеком. `throw ex;` начинает трассу заново — вы теряете место настоящего сбоя.

? Что означает фильтр исключений `catch (Exception e) when (e is TimeoutException)`? #lang
- Блок выполнится всегда
+ Блок сработает только при выполнении условия; стек при этом не раскручивается до проверки
- Блок выполнится после finally
- Это то же, что if внутри catch
= Фильтр проверяется до раскрутки стека; если условие ложно — исключение летит дальше, как будто этого catch нет.

? Где уместно ловить `Exception` целиком? #oop
- В каждом методе — «чтобы не падало»
+ На верхней границе (Main, middleware) с логированием, а не в бизнес-логике
- Никогда
- Только в конструкторах
= Общий catch прячет баги. Ловим то, что умеем обработать; верхний уровень — только чтобы залогировать и корректно ответить.
:::

:::ticket Приложение «молча» стартует на порту 0
@key OPS-212
@type Bug
@prio High
@reporter Света (DevOps)
@labels исключения, конфигурация
@xp 80
@task
Сервис берёт порт из конфига методом `ReadPort`. При опечатке в конфиге (`"80a"`) метод тихо возвращает 0 — и сервис стартует «на случайном порту», а мы полдня ищем причину.

**Ожидается:**
- пустая строка или `null` → `ArgumentException`;
- не число → `ConfigException` с **вложенным** `FormatException` (`InnerException`);
- число вне диапазона 1–65535 → `ConfigException`;
- корректное значение → вернуть порт.
@comment Света (DevOps): Пожалуйста, чтобы в логах была настоящая причина, а не «ошибка конфигурации».
@code
~~~csharp
using System;

public class ConfigException : Exception
{
    public ConfigException(string message) : base(message) { }
    public ConfigException(string message, Exception inner) : base(message, inner) { }
}

public static class Solver
{
    public static int ReadPort(string text)
    {
        try
        {
            return int.Parse(text);
        }
        catch (Exception)
        {
            return 0;
        }
    }
}
~~~
@tests
~~~csharp
class T
{
    public static void Run()
    {
        Assert.Equal(8080, Solver.ReadPort("8080"), "валидный порт");
        Assert.Throws<ArgumentException>(() => Solver.ReadPort(""), "пустая строка");
        Assert.Throws<ArgumentException>(() => Solver.ReadPort(null), "null");
        var ex = Assert.Throws<ConfigException>(() => Solver.ReadPort("80a"), "не число");
        Assert.True(ex != null && ex.InnerException is FormatException, "внутри — FormatException");
        Assert.Throws<ConfigException>(() => Solver.ReadPort("70000"), "вне диапазона");
        Assert.Throws<ConfigException>(() => Solver.ReadPort("0"), "нулевой порт");
    }
}
~~~
@forbid catch\s*\(\s*Exception\s*\)\s*\{\s*return\s+0 => Нельзя глотать исключение и возвращать 0
@hint
Сначала проверь `string.IsNullOrWhiteSpace(text)` и брось `ArgumentException`. Потом `try { n = int.Parse(text); } catch (FormatException e) { throw new ConfigException(..., e); }` — так сохранится причина.
@solution
~~~csharp
using System;

public class ConfigException : Exception
{
    public ConfigException(string message) : base(message) { }
    public ConfigException(string message, Exception inner) : base(message, inner) { }
}

public static class Solver
{
    public static int ReadPort(string text)
    {
        if (string.IsNullOrWhiteSpace(text))
            throw new ArgumentException("Порт не задан", nameof(text));

        int port;
        try
        {
            port = int.Parse(text);
        }
        catch (FormatException e)
        {
            throw new ConfigException("Порт «" + text + "» — не число", e);
        }

        if (port < 1 || port > 65535)
            throw new ConfigException("Порт вне диапазона 1–65535: " + port);
        return port;
    }
}
~~~
@why
Правило: **не глотай причину**. Ловим конкретный тип (`FormatException`), оборачиваем в доменное исключение и **передаём внутрь исходное** (`inner`) — в логе будет вся цепочка. «Вернуть 0, чтобы не падало» превращает баг конфигурации в загадку.
:::

:::compare Исключение как управление потоком
@bad
~~~csharp
using System;
static bool IsNumber(string s)
{
    try { int.Parse(s); return true; }
    catch (FormatException) { return false; }
}
Console.WriteLine(IsNumber("12"));
Console.WriteLine(IsNumber("abc"));
~~~
@badwhy
Исключение — дорогая штука (сбор стека, раскрутка) и шум в логах/отладчике. Использовать его для **ожидаемого** исхода («пользователь ввёл не число») — плохой тон; на горячем пути это ещё и в разы медленнее.
@good
~~~csharp
using System;
static bool IsNumber(string s) => int.TryParse(s, out _);
Console.WriteLine(IsNumber("12"));
Console.WriteLine(IsNumber("abc"));
~~~
@goodwhy
`TryParse` возвращает `bool` и не бросает. Исключения — для **исключительных** ситуаций: нарушен контракт, сломалась среда.
@run
:::

:::legacy Загрузка настроек пользователя (2015)
@context Метод читает настройки из «файла» (строки), и в проде периодически: «настройки откатились», «упало без причины», «неделю не было ошибок, а данные битые».
@code
~~~csharp
public Settings Load(string path)
{
    Settings s = null;
    try
    {
        var text = File.ReadAllText(path);
        s = Parse(text);
    }
    catch (Exception)
    {
    }
    finally
    {
        if (s == null)
            return new Settings();
    }
    return s;
}

public void Save(Settings s, string path)
{
    try
    {
        File.WriteAllText(path, s.Serialize());
    }
    catch (Exception ex)
    {
        throw ex;
    }
}
~~~
@bug 8 | [bug] Пустой catch (Exception) | Любая ошибка — нет файла, нет прав, битый формат — глотается без следа. Пользователь получает «настройки по умолчанию» и не знает, что его данные не прочитались.
@bug 11 | [bug] `return` внутри `finally` | Блок `finally` с `return` **перетирает** любое исключение и результат. Даже если бы выше был `throw`, он потерялся бы. (В C# это вообще запрещено компилятором — значит, код писали «из будущего» или копировали из другого языка.)
@bug 22 | [bug] `throw ex;` | Сбрасывает stack trace: в логах будет видно строку 22, а не место настоящего сбоя внутри `WriteAllText`/`Serialize`.
@bug 8 | [bug] Нет логирования и нет разделения по типам | Не отличить `FileNotFoundException` (нормальная ситуация «первого запуска») от `UnauthorizedAccessException` или `FormatException` (баг). Нужно ловить конкретные типы.
@fixed
~~~csharp
public Settings Load(string path)
{
    if (!File.Exists(path))
        return new Settings();               // первый запуск — это нормально
    try
    {
        return Parse(File.ReadAllText(path));
    }
    catch (FormatException ex)
    {
        _log.Warn(ex, "Файл настроек повреждён: {Path}", path);
        throw new SettingsException("Файл настроек повреждён", ex);
    }
}

public void Save(Settings s, string path)
{
    File.WriteAllText(path, s.Serialize());   // не ловим то, что не умеем обработать
}
~~~
:::

:::cards Исключения
finally :: Выполняется всегда (return, throw, break в try) — для освобождения ресурсов. Лучше using.
throw vs throw ex :: throw; сохраняет стек, throw ex; перезаписывает.
Фильтр исключений :: catch (E e) when (условие) — проверка до раскрутки стека.
Исключения vs TryParse :: Для ожидаемых исходов — TryXxx; исключения — для нарушенных контрактов.
InnerException :: Исходная причина при обёртке: new MyEx("msg", inner) — не теряй её.
:::
