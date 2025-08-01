// Импортируем необходимые модули из библиотек
const { Telegraf, Markup, session } = require("telegraf");
const { google } = require("googleapis");
const path = require("path");
require("dotenv").config();

// Инициализация бота с токеном из .env файла
const bot = new Telegraf(process.env.BOT_TOKEN);

// Включаем поддержку сессий для сохранения состояния пользователя
bot.use(session());

// ID Google таблицы из переменных окружения
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;

// Настройка аутентификации Google Sheets API
const auth = new google.auth.GoogleAuth({
  keyFile: path.join(__dirname, "google-credentials.json"),
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

// Инициализация Google Sheets API
const sheets = google.sheets({
  version: "v4",
  auth,
});

// Определение главного меню бота с основными разделами
const mainMenu = Markup.keyboard([
  ["Описание центра", "Услуги центра"],
  ["Экскурсия по центру", "Отзывы"],
  ["Контактные данные и адрес"],
  ["Заказать обратный звонок"],
]).resize();

// Меню для раздела услуг с основными направлениями обучения
const servicesMenu = Markup.keyboard([
  ["Программирование", "Английский"],
  ["Скетчинг", "Летний интенсив"],
  ["Городской лагерь", "Загородный Кэмп"],
  ["⬅️ В главное меню"],
]).resize();

// Подменю возрастных групп для направления программирования
const programmingAgeMenu = Markup.keyboard([
  ["Курс Junior 7 - 8 лет"],
  ["Курс Middle 9 - 10 лет"],
  ["Курс High 10 - 12 лет"],
  ["Курс Гейм-дизайнер 12 - 16 лет"],
  ["Курс Веб-дизайнер 12 - 16 лет"],
  ["⬅️ Назад к услугам"],
]).resize();

// Подменю возрастных групп для направления английского языка
const englishAgeMenu = Markup.keyboard([
  ["Курс Kids 6 - 15 лет"],
  ["Курс Junior 10 - 15 лет"],
  ["⬅️ Назад к услугам"],
]).resize();

// Подменю для выбора направления летнего интенсива
const summerIntensiveMenu = Markup.keyboard([
  ["Дизайн в Figma"],
  ["Нейросети"],
  ["⬅️ Назад к услугам"],
]).resize();

// Подменю для раздела загородного кэмпа с просмотром фотографий
const campMenu = Markup.keyboard([
  ["Фото локации"],
  ["⬅️ Назад к услугам"],
]).resize();

// Утилитарная функция для создания inline-кнопки записи
// В зависимости от типа курса меняется текст кнопки
function createTrialLessonButton(courseType) {
  const buttonText =
    courseType === "summer_club"
      ? "Узнать о сменах"
      : "Записаться на пробное занятие";
  return Markup.inlineKeyboard([
    [Markup.button.callback(buttonText, `trial_${courseType}`)],
  ]);
}

// Функция для сохранения данных заявки в Google таблицу
// Принимает массив данных, тип запроса и название курса
// Автоматически добавляет временную метку к записи
async function appendToSheet(
  data,
  requestType = "Обратный звонок",
  course = ""
) {
  try {
    const timestamp = new Date().toLocaleString();
    const rowData = [...data, requestType, course];
    sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: "Запись!A:F", // Диапазон скорректирован: A-дата, B-имя, C-username, D-телефон, E-тип запроса, F-курс
      valueInputOption: "RAW",
      resource: {
        values: [rowData],
      },
    });
    console.log("Данные успешно записаны в Google таблицу.");
  } catch (error) {
    console.error("Ошибка записи в Google таблицу:", error.message);
  }
}

// Функция для логирования действий пользователя в отдельный лист таблицы
// Сохраняет дату, ID пользователя, имя и выполненное действие
async function logUserAction(ctx, action) {
  try {
    // Получаем текущую дату и информацию о пользователе
    const date = new Date().toLocaleString("ru");
    const userId = ctx.from?.id || "неизвестно";
    const username = ctx.from?.username || "нет";
    const firstName = ctx.from?.first_name || "неизвестно";
    const lastName = ctx.from?.last_name || "";
    const fullName = `${firstName} ${lastName}`.trim();

    // Формируем строку для записи в таблицу
    const rowData = [date, userId, username, fullName, action];

    // Записываем данные в лист "Статистика"
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: "Статистика!A:E",
      valueInputOption: "RAW",
      resource: {
        values: [rowData],
      },
    });
  } catch (error) {
    console.error("Ошибка при сохранении статистики:", error);
  }
}

// Функция для добавления пользователя в список рассылки
// Сохраняет информацию о пользователе для последующих рассылок
async function saveUserToNewsletter(ctx) {
  try {
    // Получаем информацию о пользователе для рассылки
    const userId = ctx.from?.id;
    const username = ctx.from?.username || "нет";
    const firstName = ctx.from?.first_name || "";
    const lastName = ctx.from?.last_name || "";
    const date = new Date().toLocaleString("ru");

    // Проверяем наличие пользователя в списке рассылки
    const sheets = google.sheets({ version: "v4", auth });
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: "Рассылка!A:D", // Лист для хранения подписчиков рассылки
    });

    // Проверяем существование пользователя по его ID
    const rows = response.data.values || [];
    const userExists = rows.some((row) => row[0] === userId.toString());

    // Добавляем пользователя только если его еще нет в списке
    if (!userExists) {
      const rowData = [userId, username, `${firstName} ${lastName}`, date];
      await sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: "Рассылка!A:D",
        valueInputOption: "RAW",
        resource: {
          values: [rowData],
        },
      });
    }
  } catch (error) {
    console.error("Ошибка при сохранении пользователя в рассылку:", error);
  }
}

// Функция для массовой рассылки сообщений всем подписчикам
// Поддерживает отправку текста и изображений
async function sendNewsletter(message, imageUrl = null) {
  try {
    // Получаем список всех подписчиков
    const sheets = google.sheets({ version: "v4", auth });
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: "Рассылка!A:A", // Получаем только столбец с ID пользователей
    });

    // Инициализируем счетчики успешных и неуспешных отправок
    const rows = response.data.values || [];
    let successCount = 0;
    let errorCount = 0;

    // Отправляем сообщение каждому пользователю
    for (const row of rows) {
      const userId = row[0];
      try {
        // Если есть изображение, отправляем фото с подписью
        if (imageUrl) {
          await bot.telegram.sendPhoto(userId, imageUrl, {
            caption: message,
            parse_mode: "MarkdownV2",
          });
        } else {
          // Иначе отправляем только текст
          await bot.telegram.sendMessage(userId, message, {
            parse_mode: "MarkdownV2",
          });
        }
        successCount++;
        // Делаем паузу между отправками для избежания лимитов Telegram
        await new Promise((resolve) => setTimeout(resolve, 100));
      } catch (error) {
        errorCount++;
        console.error(
          `Ошибка отправки сообщения пользователю ${userId}:`,
          error
        );
      }
    }
    return { successCount, errorCount }; // Возвращаем статистику отправки
  } catch (error) {
    console.error("Ошибка при выполнении рассылки:", error);
    return { successCount: 0, errorCount: 0 };
  }
}

// Список ID пользователей с правами администратора
// Эти пользователи могут использовать команду /broadcast для рассылки
const ADMIN_IDS = ["502105220, 5734831768, 451751415"]; // ID администраторов

// Обработчик команды /start - точка входа для нового пользователя
bot.start(async (ctx) => {
  await logUserAction(ctx, "Запуск бота"); // Логируем запуск
  await saveUserToNewsletter(ctx); // Добавляем пользователя в список рассылки
  await ctx.replyWithPhoto("https://imgfoto.host/i/cQ0VbO"); // Отправляем приветственное фото
  // Отправляем приветственное сообщение с главным меню
  await ctx.reply(
    "Добро пожаловать в детский центр Учи.ру|Челябинск! Выберите интересующий раздел:",
    mainMenu
  );
});

// Обработчик для раздела "Описание центра"
// Отправляет подробную информацию о направлениях и преимуществах центра
bot.hears("Описание центра", (ctx) =>
  ctx.reply(
    `🎓 *Очные занятия* по трём направлениям, а также *летний клуб дневного пребывания* для детей 6–16 лет.

📚 *Немного о детском центре:*

*3 кружка:*
   - 💻 Программирование
   - 🇬🇧 Английский язык
   - 🎨 Скетчинг (быстрые зарисовки)

🎁 *Пробное занятие — бесплатно!*

*Также:*
   - ☀️ Летний клуб дневного пребывания с 8:00 до 19:00 7–12 лет.
   - 🚀 Летние интенсивы по изучению нейросетей, 3D-моделирования и дизайна 12–16 лет.

📍 *Наши занятия проходят в центре Учи.ру|Челябинск по адресу:*
   - г. Челябинск, ул. Университетская Набережная, 103.`,
    { parse_mode: "Markdown" } // Включаем поддержку форматирования Markdown
  )
);

// Обработчик кнопки "Услуги центра"
// Показывает меню со всеми доступными услугами
bot.hears("Услуги центра", async (ctx) => {
  await logUserAction(ctx, "Открытие раздела услуг центра");
  ctx.reply("Выберите услугу:", servicesMenu);
});

// Обработчик кнопки "Экскурсия по центру"
// В будущем здесь будет размещена информация об экскурсиях
bot.hears("Экскурсия по центру", async (ctx) => {
  await logUserAction(ctx, "Просмотр фотографий экскурсии по центру");
  await ctx.replyWithPhoto(
    { source: excursionPhotos.photos[0] },
    {
      caption: `Фотография 1 из ${excursionPhotos.photos.length}`,
      reply_markup: {
        inline_keyboard: [
          [
            { text: "⬅️", callback_data: "prev_excursion_photo" },
            { text: "➡️", callback_data: "next_excursion_photo" },
          ],
        ],
      },
    }
  );
});

// Обработчик раздела "Отзывы"
// Предоставляет ссылки на внешние платформы с отзывами
bot.hears("Отзывы", async (ctx) => {
  await logUserAction(ctx, "Открытие раздела отзывы");
  await ctx.reply(
    `*Отзывы о нашем центре*

⭐️ Мы гордимся тем, что делаем, и рады получать отзывы от наших учеников и их родителей!

📱 Выберите удобную для вас платформу, чтобы прочитать отзывы или оставить свой:`,
    {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        // Кнопка для перехода к отзывам на Яндекс.Картах
        [
          Markup.button.url(
            "📍 Отзывы на Яндекс.Картах",
            "https://yandex.ru/maps/org/uchi_ru/75683029498/reviews/?ll=61.314779%2C55.171792&tab=reviews&z=17.57"
          ),
        ],
        // Кнопка для перехода к отзывам на 2ГИС
        [
          Markup.button.url(
            "📍 Отзывы на 2ГИС",
            "https://2gis.ru/chelyabinsk/inside/2111698002516597/firm/70000001064364845/tab/reviews?m=61.313794%2C55.171612%2F20"
          ),
        ],
      ]),
    }
  );
});

// Обработчик раздела "Контактные данные и адрес"
// Отправляет геолокацию и полные контактные данные центра
bot.hears("Контактные данные и адрес", async (ctx) => {
  await logUserAction(ctx, "Открытие раздела контактные данные и адрес");
  // Отправляем геолокацию центра
  // await ctx.replyWithLocation(55.171639, 61.314225);
  // Отправляем подробную контактную информацию
  await ctx.reply(
    `📍 *Наш адрес:*
г\\. Челябинск, ул\\. Университетская набережная, д\\.103

📞 *Телефон для связи:*
\\+7 \\(906\\) 870\\-38\\-08`,
    {
      parse_mode: "MarkdownV2",
      ...Markup.inlineKeyboard([
        // Быстрый переход в чат с менеджером
        [Markup.button.url("📱 Написать менеджеру", "https://t.me/Uchiru_74")],
        // Переход на официальный сайт центра
        [
          Markup.button.url(
            "🌐 Перейти на сайт",
            "https://uchiru-chel.clients.site/"
          ),
        ],
        // Переход в группу ВКонтакте
        [
          Markup.button.url(
            "💙 Группа ВКонтакте",
            "https://vk.com/uchi.ru_center_chelyabinsk"
          ),
        ],
        // Открытие локации на Яндекс.Картах
        [
          Markup.button.url(
            "🗺 Открыть на Яндекс.Картах",
            "https://yandex.ru/maps/org/uchi_ru/75683029498/?ll=61.314225%2C55.171639&z=18.68"
          ),
        ],
      ]),
    }
  );
});

// Обработчик заявки на обратный звонок
// Запрашивает у пользователя контактные данные
bot.hears("Заказать обратный звонок", (ctx) => {
  ctx.reply(
    "Пожалуйста, отправьте свой номер телефона, нажав на кнопку ниже. Отправляя свои контактные данные, вы соглашаетесь с [условиями обработки персональных данных](https://vk.com/topic-215941105_53277426).",
    {
      parse_mode: "Markdown",
      ...Markup.keyboard([
        [Markup.button.contactRequest("Отправить номер телефона")],
        ["⬅️ В главное меню"],
      ]).resize(),
    }
  );
});

// Словарь соответствия кодов курсов их полным названиям
// Используется для обработки заявок на пробные занятия
const trialLessonCallbacks = {
  // Курсы программирования
  junior: "Программирование - Курс Junior (7-8 лет)",
  middle: "Программирование - Курс Middle (9-10 лет)",
  high: "Программирование - Курс High (10-12 лет)",
  gamedev: "Программирование - Курс Гейм-дизайнер (12-16 лет)",
  webdev: "Программирование - Курс Веб-дизайнер (12-16 лет)",
  // Курсы английского языка
  english_kids: "Английский язык - Курс Kids (6-15 лет)",
  english_junior: "Английский язык - Курс Junior (10-15 лет)",
  // Дополнительные курсы
  sketch: "Скетчинг - Курс для детей 7-12 лет",
  // Летние программы
  summer_figma: "Летний интенсив - Дизайн в Figma (12-16 лет)",
  summer_ai: "Летний интенсив - Нейросети (12-16 лет)",
  summer_club: "Городской лагерь",
  summer_camp: "Загородный кэмп",
};

// Генерация обработчиков для всех типов курсов
Object.keys(trialLessonCallbacks).forEach((course) => {
  // Для каждого курса создаем обработчик действия записи на пробное занятие
  bot.action(`trial_${course}`, async (ctx) => {
    // Сохраняем в сессии информацию о выбранном курсе
    ctx.session = {
      awaitingContact: true,
      course: trialLessonCallbacks[course],
    };

    // Формируем сообщение в зависимости от типа курса
    const message =
      course === "summer_club"
        ? "Отправьте свой номер телефона для связи с менеджером. Мы расскажем о доступных сменах и ответим на все вопросы. Отправляя свои контактные данные, вы соглашаетесь с [условиями обработки персональных данных](https://vk.com/topic-215941105_53277426)."
        : `Для записи на пробное занятие:\n${trialLessonCallbacks[course]}\n\nОтправьте свой номер телефона, нажав на кнопку ниже. Отправляя свои контактные данные, вы соглашаетесь с [условиями обработки персональных данных](https://vk.com/topic-215941105_53277426).`;

    // Отправляем запрос контактных данных
    await ctx.reply(message, {
      parse_mode: "Markdown",
      ...Markup.keyboard([
        [Markup.button.contactRequest("Отправить номер телефона")],
        ["⬅️ В главное меню"],
      ]).resize(),
    });

    // Подтверждаем обработку callback-запроса
    try {
      await ctx.answerCbQuery();
    } catch (error) {
      console.error("Error answering callback query:", error);
    }
  });
});

// Обработчик бронирования загородного кэмпа
bot.action("book_camp", async (ctx) => {
  // Сохраняем в сессии информацию о запросе
  ctx.session = {
    awaitingContact: true,
    course: "Загородный кэмп",
  };

  // Запрашиваем контактные данные для бронирования
  await ctx.reply(
    "Для бронирования смены в загородном кэмпе, пожалуйста, отправьте свой номер телефона, нажав на кнопку ниже. Наш менеджер свяжется с вами, расскажет о доступных сменах и поможет с оформлением. Отправляя свои контактные данные, вы соглашаетесь с [условиями обработки персональных данных](https://vk.com/topic-215941105_53277426).",
    {
      parse_mode: "Markdown",
      ...Markup.keyboard([
        [Markup.button.contactRequest("Отправить номер телефона")],
        ["⬅️ В главное меню"],
      ]).resize(),
    }
  );

  await ctx.answerCbQuery();
});

// Обработчик получения контактных данных
// Срабатывает при отправке пользователем своего номера телефона
bot.on("contact", async (ctx) => {
  // Получаем данные из контакта
  const phone = ctx.message.contact.phone_number;
  await logUserAction(ctx, `Отправка контакта: ${phone}`);
  const firstName = ctx.message.contact.first_name || "";
  const lastName = ctx.message.contact.last_name || "";
  const username = ctx.message.from.username || "";
  const date = new Date().toLocaleString("ru");

  // Определяем тип запроса (пробное занятие или обратный звонок)
  const requestType = ctx.session?.awaitingContact
    ? "Запись на пробное занятие"
    : "Обратный звонок";
  const course = ctx.session?.course || "";

  // Сохраняем данные заявки в таблицу
  const rowData = [date, firstName, username, phone];
  await appendToSheet(rowData, requestType, course);

  // Формируем ответное сообщение в зависимости от типа запроса
  let responseMessage = "Спасибо! ";
  if (course === "Загородный кэмп") {
    // Ответ для заявок на загородный кэмп
    responseMessage =
      "Спасибо за интерес к нашему загородному кэмпу! Менеджер свяжется с вами в ближайшее время, расскажет о доступных сменах и поможет с оформлением.";
  } else if (course === "Городской лагерь") {
    // Ответ для заявок на городской клуб
    responseMessage =
      "Спасибо за интерес к нашему городскому клубу! Менеджер свяжется с вами в ближайшее время и расскажет подробнее о сменах и программе.";
  } else if (requestType === "Запись на пробное занятие") {
    // Ответ для записи на пробное занятие
    responseMessage += `Ваша заявка на пробное занятие по курсу "${course}" принята. Мы свяжемся с вами в ближайшее время по номеру ${phone}.`;
  } else {
    // Ответ для обратного звонка
    responseMessage += `Мы свяжемся с вами в ближайшее время по номеру ${phone}.`;
  }

  // Отправляем подтверждение и возвращаем главное меню
  ctx.reply(responseMessage, mainMenu);
  // Логируем получение заявки
  console.log(
    `Получена заявка: ${requestType} ${
      course ? `на курс ${course}` : ""
    } от ${firstName} ${lastName}, ${phone}`
  );

  // Очищаем сессию
  ctx.session = {};
});

// Обработчик для раздела "Программирование"
// Отправляет фото и меню выбора возрастной группы
bot.hears("Программирование", async (ctx) => {
  await logUserAction(ctx, "Открытие раздела Программирование");
  await ctx.replyWithPhoto("https://imgfoto.host/i/cQvADk");
  ctx.reply(
    "Курсы программирования. Выберите возрастную группу:",
    programmingAgeMenu
  );
});

// Обработчик для раздела "Английский"
// Отправляет фото и меню выбора возрастной группы для курсов английского
bot.hears("Английский", async (ctx) => {
  await logUserAction(ctx, "Открытие раздела Английский");
  await ctx.replyWithPhoto("https://imgfoto.host/i/cQNyt5");
  ctx.reply(
    "Курсы английского языка. Выберите возрастную группу:",
    englishAgeMenu
  );
});

// Обработчик для раздела "Скетчинг"
// Отправляет фото и подробное описание курса с форматированным текстом
bot.hears("Скетчинг", async (ctx) => {
  await logUserAction(ctx, "Открытие раздела Скетчинг");
  await ctx.replyWithPhoto("https://imgfoto.host/i/cW7duY");
  await ctx.reply(
    // Форматированное описание курса с использованием Markdown
    `*Курс Скетчинг (для детей 7-12 лет)*

📚 *Формат обучения:*
• Занятия 2 раза в неделю по 60 минут
• Группы до 8 человек
• Все материалы включены в стоимость
• Регулярные выставки работ
• Участие в конкурсах
• Практика на пленэре

🎨 *Чему научится ребенок:*
• Быстро делать зарисовки
• Работать с разными материалами
• Передавать объем и форму
• Рисовать с натуры
• Создавать композиции
• Работать с цветом и светом

📝 *Программа курса включает:*
• Основы композиции
• Техники быстрого рисунка
• Работа с карандашом и маркерами
• Цветоведение
• Перспектива
• Анатомия и пропорции

🌟 *Особенности курса:*
• Современные техники скетчинга
• Работа с различными материалами
• Создание портфолио
• Участие в выставках
• Развитие креативности
• Индивидуальный подход

🎁 *Пробное занятие бесплатно!*`,
    {
      // Настройки для форматирования текста и добавление кнопки записи на пробное занятие
      parse_mode: "Markdown",
      ...createTrialLessonButton("sketch"),
    }
  );
});

// Обработчик для раздела "Летний интенсив"
// Отправляет фото и меню выбора направления интенсива
bot.hears("Летний интенсив", async (ctx) => {
  await logUserAction(ctx, "Открытие раздела Летний интенсив");
  await ctx.replyWithPhoto("https://imgfoto.host/i/cjSNmw");
  ctx.reply("Выберите направление летнего интенсива:", summerIntensiveMenu);
});

// Обработчик для раздела "Городской лагерь"
// Отправляет фото и информацию о городском клубе
bot.hears("Городской лагерь", async (ctx) => {
  await logUserAction(ctx, "Открытие раздела Городской лагерь");
  await ctx.replyWithPhoto("https://imgfoto.host/i/cjZl0a");
  await ctx.reply(
    `*Городской лагерь*

🌟 Представляем вам детский клуб полного дня \\(аналог городского лагеря\\)\\!
_Прекрасный повод спланировать занятость ребёнка на лето\\!_

📍 *Место проведения:*
• Детский центр Учи\\.ру
• Университетская набережная, 103

⏰ *Время работы:*
• 2 недели по будням 
• С 8:00 до 19:00

🎯 *В программу входит:*

📚 *Учебная часть*
• Увлекательные интенсивы на выбор:
   \\- Английский язык
   \\- Программирование
   \\- Скетчинг

🎨 *Активности*
• Выезды на экскурсии 4 раза за смену
• Посещение культурно\\-развлекательных объектов
• Арт\\-мастерская
• Развивающие тренинги
• Увлекательные квесты
• Командные игры
• Настольные игры
• Мини\\-кинотеатр

🌳 *Прогулки и отдых*
• Специально оборудованные площадки
• Опытные педагоги
• Активные игры на свежем воздухе

🍽 *Питание*
• 2 вкусных перекуса
• Полноценный обед в кафе
• Ежедневное разнообразное меню

✨ *Дополнительно*
• Активный отдых
• Новые друзья
• Дружеская атмосфера
• Опытные преподаватели

💫 *Выбирайте самую интересную смену, а лучше несколько\\!*`,
    {
      parse_mode: "MarkdownV2",
      ...createTrialLessonButton("summer_club"),
    }
  );
});

// Обработчик для раздела "Загородный Кэмп"
// Отправляет фото, описание кэмпа и дополнительные кнопки навигации
bot.hears("Загородный Кэмп", async (ctx) => {
  await logUserAction(ctx, "Открытие раздела Загородный Кэмп");
  // Отправляем главное фото кэмпа
  await ctx.replyWithPhoto("https://imgfoto.host/i/c2p5Gk");
  // Отправляем основное описание с кнопкой бронирования
  await ctx.reply(
    `*🌟Летний загородный кэмп🌟*

Яркая развлекательно\\-образовательная смена летних каникул с командой «English by Bai» & «Учи\\.ру» — это уникальная возможность для детей весело и с практической пользой провести время в *загородном отеле Аврора на берегу озера Киреты*\\.`,
    {
      // Используем MarkdownV2 для расширенного форматирования текста
      parse_mode: "MarkdownV2",
      // Добавляем встроенную кнопку для бронирования смены
      reply_markup: {
        inline_keyboard: [
          [{ text: "🏕 Забронировать смену", callback_data: "book_camp" }],
        ],
      },
    }
  );
  // Отправляем дополнительное сообщение с кнопками навигации
  await ctx.reply(
    "Чтобы увидеть больше фотографий локации, нажмите кнопку в меню",
    {
      parse_mode: "MarkdownV2",
      // Добавляем клавиатуру с кнопками для просмотра фото и возврата
      ...Markup.keyboard([["Фото локации"], ["⬅️ Назад к услугам"]]).resize(),
    }
  );
});

// Хранилище путей к фотографиям локации кэмпа
// Используется для организации галереи фотографий
const campPhotos = {
  // Массив путей к локальным файлам фотографий
  photos: [
    "./assets/camp-photos/1 (1).jpg",
    "./assets/camp-photos/1 (2).jpg",
    "./assets/camp-photos/1 (3).jpg",
    "./assets/camp-photos/1 (4).jpg",
    "./assets/camp-photos/1 (5).jpg",
    "./assets/camp-photos/1 (6).jpg",
    "./assets/camp-photos/1 (7).jpg",
    "./assets/camp-photos/1 (8).jpg",
  ],
  currentIndex: 0, // Индекс текущей отображаемой фотографии
};

// Обработчик команды просмотра фотографий локации
// Отправляет первую фотографию с кнопками навигации
bot.hears("Фото локации", async (ctx) => {
  await logUserAction(ctx, "Просмотр фотографий локации кэмпа");
  // Отправляем первую фотографию из галереи с кнопками навигации
  await ctx.replyWithPhoto(
    { source: campPhotos.photos[0] },
    {
      caption: `Фотография 1 из ${campPhotos.photos.length}`,
      // Добавляем встроенную клавиатуру с кнопками навигации
      reply_markup: {
        inline_keyboard: [
          [
            { text: "⬅️", callback_data: "prev_photo" }, // Кнопка "Предыдущее фото"
            { text: "➡️", callback_data: "next_photo" }, // Кнопка "Следующее фото"
          ],
        ],
      },
    }
  );
});

// Обработчик кнопки "Предыдущее фото"
// Обновляет сообщение с фотографией на предыдущую в галерее
bot.action("prev_photo", async (ctx) => {
  // Вычисляем индекс предыдущей фотографии с учетом цикличности
  campPhotos.currentIndex =
    (campPhotos.currentIndex - 1 + campPhotos.photos.length) %
    campPhotos.photos.length;
  try {
    // Обновляем сообщение с новой фотографией
    await ctx.editMessageMedia(
      {
        type: "photo",
        media: { source: campPhotos.photos[campPhotos.currentIndex] },
        caption: `Фотография ${campPhotos.currentIndex + 1} из ${
          campPhotos.photos.length
        }`,
      },
      {
        // Сохраняем кнопки навигации
        reply_markup: {
          inline_keyboard: [
            [
              { text: "⬅️", callback_data: "prev_photo" },
              { text: "➡️", callback_data: "next_photo" },
            ],
          ],
        },
      }
    );
  } catch (error) {
    console.error("Error updating photo:", error);
  }
  // Отправляем подтверждение обработки callback запроса
  await ctx.answerCbQuery();
});

// Обработчик кнопки "Следующее фото"
// Обновляет сообщение со следующей фотографией в галерее
bot.action("next_photo", async (ctx) => {
  // Вычисляем индекс следующей фотографии с учетом цикличности
  campPhotos.currentIndex =
    (campPhotos.currentIndex + 1) % campPhotos.photos.length;
  try {
    // Обновляем сообщение с новой фотографией
    await ctx.editMessageMedia(
      {
        type: "photo",
        media: { source: campPhotos.photos[campPhotos.currentIndex] },
        caption: `Фотография ${campPhotos.currentIndex + 1} из ${
          campPhotos.photos.length
        }`,
      },
      {
        // Сохраняем кнопки навигации
        reply_markup: {
          inline_keyboard: [
            [
              { text: "⬅️", callback_data: "prev_photo" },
              { text: "➡️", callback_data: "next_photo" },
            ],
          ],
        },
      }
    );
  } catch (error) {
    console.error("Error updating photo:", error);
  }
  // Отправляем подтверждение обработки callback запроса
  await ctx.answerCbQuery();
});

// Хранилище путей к фотографиям экскурсии
const excursionPhotos = {
  photos: [
    "./assets/excursion/2 (1).jpg",
    "./assets/excursion/2 (2).jpg",
    "./assets/excursion/2 (3).jpg",
    "./assets/excursion/2 (4).jpg",
    "./assets/excursion/2 (5).jpg",
  ],
  currentIndex: 0,
};

// Обработчик команды просмотра фотографий экскурсии
bot.hears("Экскурсия по центру", async (ctx) => {
  await logUserAction(ctx, "Просмотр фотографий экскурсии по центру");
  await ctx.replyWithPhoto(
    { source: excursionPhotos.photos[0] },
    {
      caption: `Фотография 1 из ${excursionPhotos.photos.length}`,
      reply_markup: {
        inline_keyboard: [
          [
            { text: "⬅️", callback_data: "prev_excursion_photo" },
            { text: "➡️", callback_data: "next_excursion_photo" },
          ],
        ],
      },
    }
  );
});

// Обработчик кнопки "Предыдущее фото экскурсии"
bot.action("prev_excursion_photo", async (ctx) => {
  excursionPhotos.currentIndex =
    (excursionPhotos.currentIndex - 1 + excursionPhotos.photos.length) %
    excursionPhotos.photos.length;
  try {
    await ctx.editMessageMedia(
      {
        type: "photo",
        media: { source: excursionPhotos.photos[excursionPhotos.currentIndex] },
        caption: `Фотография ${excursionPhotos.currentIndex + 1} из ${
          excursionPhotos.photos.length
        }`,
      },
      {
        reply_markup: {
          inline_keyboard: [
            [
              { text: "⬅️", callback_data: "prev_excursion_photo" },
              { text: "➡️", callback_data: "next_excursion_photo" },
            ],
          ],
        },
      }
    );
  } catch (error) {
    console.error("Error updating excursion photo:", error);
  }
  await ctx.answerCbQuery();
});

// Обработчик кнопки "Следующее фото экскурсии"
bot.action("next_excursion_photo", async (ctx) => {
  excursionPhotos.currentIndex =
    (excursionPhotos.currentIndex + 1) % excursionPhotos.photos.length;
  try {
    await ctx.editMessageMedia(
      {
        type: "photo",
        media: { source: excursionPhotos.photos[excursionPhotos.currentIndex] },
        caption: `Фотография ${excursionPhotos.currentIndex + 1} из ${
          excursionPhotos.photos.length
        }`,
      },
      {
        reply_markup: {
          inline_keyboard: [
            [
              { text: "⬅️", callback_data: "prev_excursion_photo" },
              { text: "➡️", callback_data: "next_excursion_photo" },
            ],
          ],
        },
      }
    );
  } catch (error) {
    console.error("Error updating excursion photo:", error);
  }
  await ctx.answerCbQuery();
});

// Закомментированный обработчик возврата в главное меню
// bot.hears("⬅️ В главное меню", (ctx) =>
//   ctx.reply("Вы вернулись в главное меню.", mainMenu)
// );

// Обработка направлений летнего интенсива
bot.hears("Дизайн в Figma", async (ctx) => {
  await ctx.replyWithPhoto("https://imgfoto.host/i/ct3NXd");
  await ctx.reply(
    // Форматированное описание курса с использованием Markdown
    `*Летний интенсив: Дизайн в Figma (для детей 12-16 лет)*

📚 *Формат обучения:*
• Интенсивный курс - 2 недели
• Занятия каждый день по 2 часа
• Группы до 10 человек
• Игровой формат обучения
• Перерывы на отдых и веселые разминки
• Все необходимое оборудование предоставляется

🎨 *Программа курса:*
• Графический дизайн и знакомство с Figma
• Работа с формами и цветом
• Типографика, виды шрифтов, их сочетания
• Иконки и простые иллюстрации
• Основы UX-дизайна
• Основы дизайна интерфейсов (UI)
• Анимация и прототипирование
• Логотипы и брендинг
• Создание макета сайта

💡 *Проекты, которые создаст ребенок:*
• Собственный логотип и фирменный стиль
• Дизайн личного сайта-портфолио
• Набор анимированных иконок
• Интерактивный прототип приложения
• Макет landing page

🌟 *Результаты обучения:*
• Освоит профессиональный инструмент Figma
• Научится создавать современные дизайн-макеты
• Разовьет креативное мышление
• Получит основы профессии дизайнера
• Создаст первое портфолио работ

💫 *Запишитесь на пробное занятие прямо сейчас!*`,
    {
      // Настройки форматирования и добавление кнопки записи
      parse_mode: "Markdown",
      ...createTrialLessonButton("summer_figma"),
    }
  );
});

// Обработчик для направления "Нейросети"
// Отправляет фото и подробное описание летнего интенсива по нейросетям
bot.hears("Нейросети", async (ctx) => {
  await ctx.replyWithPhoto("https://imgfoto.host/i/ct3dFK");
  await ctx.reply(
    // Форматированное описание курса с использованием Markdown
    `*Летний интенсив: Нейросети (для детей 12-16 лет)*

📍 *Где проходит обучение:*
• Кружок Учи.ру по адресу: Университетская набережная, 103

📚 *Формат обучения:*
• 10 занятий по 180 минут
• Группы до 8 человек
• Все необходимое оборудование предоставляется
• Занятия в игровой форме с перерывами
• Индивидуальный подход к каждому

🎯 *Программа интенсива:*
• Знакомство с искусственным интеллектом и нейросетями
• Основы промт-инжиниринга для генерации текстов
• Практика работы с ChatGPT и другими текстовыми AI
• Создание и анимация изображений в Midjourney
• Программирование с помощью GitHub Copilot
• Использование нейросетей в учебе
• Создание и ведение блога с помощью AI

💡 *Проекты, которые создаст ребенок:*
• Собственный AI-ассистент для учебы
• Серия художественных изображений
• Анимированные видео
• Блог с AI-контентом
• Проект с использованием AI-программирования

🌟 *Результаты обучения:*
• Освоит популярные нейросети
• Научится эффективно формулировать запросы
• Сможет создавать качественный контент
• Поймет, как применять AI в учебе
• Получит навыки работы с новыми технологиями

💫 *Запишитесь на пробное занятие прямо сейчас!*`,
    {
      parse_mode: "Markdown",
      ...createTrialLessonButton("summer_ai"),
    }
  );
});

// Обработчик возврата в главное меню
bot.hears("⬅️ В главное меню", (ctx) =>
  ctx.reply("Вы вернулись в главное меню.", mainMenu)
);

// Обработчики возрастных групп программирования
// Каждый обработчик отправляет фото и подробное описание курса с кнопкой записи

// Обработчик для курса Junior (7-8 лет)
bot.hears("Курс Junior 7 - 8 лет", async (ctx) => {
  // Отправляем фото курса
  await ctx.replyWithPhoto("https://imgfoto.host/i/cQRMta");
  // Отправляем подробное описание с форматированием Markdown
  await ctx.reply(
    `*Курс Junior (для детей 7-8 лет)*

📚 *Формат обучения:*
• Занятия 1 раз в неделю по 90 минут
• Группы до 10 человек
• Интересные задания от опытных методистов
• Геймификация обучения
• Видеоролики с домашними заданиями по теме урока
• Ноутбуки и рабочие тетради для занятий мы выдадим

🎯 *Занимаясь с нами, ребенок сможет:*
• Узнать больше о программистах и геймдизайнерах
• Познакомиться с основами программирования: алгоритмами, переменными и циклами
• Улучшить навыки работы с компьютером
• Развить логику, алгоритмическое и пространственное мышление
• Создавать 3D-игры и анимации

🎮 *За время обучения ребенок создаст:*
• Различные постройки в Minecraft при помощи программирования
• 8 игр и анимаций в средах ScratchJr и Tynker
• Гоночную 3D игру в среде KoduGame Lab
• 7 игр и анимаций в среде Scratch
• 3 собственных проекта и защитит их

🎁 *Пробное занятие бесплатно!*`,
    {
      parse_mode: "Markdown",
      ...createTrialLessonButton("junior"), // Добавляем кнопку записи на пробное занятие
    }
  );
});

// Обработчик для курса Middle (9-10 лет)
bot.hears("Курс Middle 9 - 10 лет", async (ctx) => {
  // Отправляем фото курса
  await ctx.replyWithPhoto("https://imgfoto.host/i/cQTu3M");
  // Отправляем подробное описание с форматированием Markdown
  await ctx.reply(
    `*Курс Middle (для детей 9-10 лет)*

📚 *Формат обучения:*
• Занятия 1 раз в неделю по 90 минут
• Группы до 10 человек
• Интересные задания от опытных методистов
• Геймификация обучения
• Видеоролики с домашними заданиями по теме урока
• Ноутбуки и рабочие тетради для занятий мы выдадим

🎯 *Занимаясь с нами, ребенок сможет:*
• Узнать больше о геймдизайнерах и 3D-моделлерах
• Познакомится с основами программирования: алгоритмами, переменными и циклами
• Научится работать с игровыми движками Stencyl и Roblox Studio
• Развить логику, алгоритмическое и пространственное мышление
• Создавать многоуровневые 2D и 3D игры

🎮 *За время обучения ребенок создаст:*
• Квесты в мире Minecraft по мотивам фильма "Звездные войны"
• Игры с меню, подсчетом очков и программированием победы
• Многоуровневые flash-игры с проработкой локаций и сценариев
• 3 собственных проекта и защитит их
• Собственную игру в Roblox, которую сможет загрузить на платформу и поделиться с друзьями

🎁 *Пробное занятие бесплатно!*`,
    {
      parse_mode: "Markdown",
      ...createTrialLessonButton("middle"), // Добавляем кнопку записи на пробное занятие
    }
  );
});

// Обработчик для курса High (10-12 лет)
bot.hears("Курс High 10 - 12 лет", async (ctx) => {
  // Отправляем фото курса
  await ctx.replyWithPhoto("https://imgfoto.host/i/cQV5fV");
  // Отправляем подробное описание с форматированием Markdown
  await ctx.reply(
    `*Курс High (для детей 10-12 лет)*

📚 *Формат обучения:*
• Занятия 1 раз в неделю по 90 минут
• Группы до 10 человек
• Интересные задания от опытных методистов
• Геймификация обучения
• Видеоролики с домашними заданиями по теме урока
• Ноутбуки и рабочие тетради для занятий мы выдадим

🎯 *Занимаясь с нами, ребенок сможет:*
• Познакомиться с основами программирования и более сложными структурами: массивами, списками, функциями
• Изучить язык JavaScript и попробовать себя в роли веб-разработчика
    • Работать с игровым движком Stencyl
• Развить логику, алгоритмическое и пространственное мышление
• Создавать приложения и игры под Android и iOS, строить интерфейсы приложений

🎮 *За время обучения ребенок создаст:*
• 6 приложений и игр для Android и iOS
• Многоуровневые flash-игры с проработкой локаций и сценариев
• Браузерные игры в JavaScript
• 3 собственных проекта

🎁 *Пробное занятие бесплатно!*`,
    {
      parse_mode: "Markdown",
      ...createTrialLessonButton("high"), // Добавляем кнопку записи на пробное занятие
    }
  );
});

// Обработчик для курса Гейм-дизайнер (12-16 лет)
// Отправляет фото и подробное описание курса по разработке игр
bot.hears("Курс Гейм-дизайнер 12 - 16 лет", async (ctx) => {
  // Отправляем фото курса
  await ctx.replyWithPhoto("https://imgfoto.host/i/cQSDbl");
  // Отправляем подробное описание с форматированием Markdown
  await ctx.reply(
    `*Курс Expert (для детей 12-16 лет)*

📚 *Формат обучения:*
• Занятия 1 раз в неделю по 90 минут
• Группы до 10 человек
• Интересные задания от опытных методистов
• Геймификация обучения
• Видеоролики с домашними заданиями по теме урока
• Ноутбуки и рабочие тетради для занятий мы выдадим

🎯 *Занимаясь с нами, ребенок сможет:*
• Познакомиться с основами программирования: объектами, функциями, переменными
• Изучить основы 3D-моделирования и геймдизайна
• Работать профессиональными игровыми движками Unity и Unreal Engine
• Познакомиться с языком программирования C#
• Развить логику, алгоритмическое и пространственное мышление
• Создавать 3D-модели и 3D-игры
• Получить базовое представление об огромной сфере разработки игр

🎮 *За время обучения ребенок создаст:*
• Игры на профессиональных движках Unity 3D и Unreal Engine
• Множество 3D-моделей в программе Blender и соберет из них сцену - пиратскую каюту, которую использует в игровом движке Unreal Engine
• 2 собственных проекта

🎁 *Пробное занятие бесплатно!*`,
    {
      parse_mode: "Markdown",
      ...createTrialLessonButton("gamedev"), // Добавляем кнопку записи на пробное занятие
    }
  );
});

// Обработчик для курса Веб-дизайнер (12-16 лет)
// Отправляет фото и подробное описание курса по веб-разработке
bot.hears("Курс Веб-дизайнер 12 - 16 лет", async (ctx) => {
  // Отправляем фото курса
  await ctx.replyWithPhoto("https://imgfoto.host/i/cQHzSV");
  // Отправляем подробное описание с форматированием Markdown
  await ctx.reply(
    `*Курс Super (для детей 12-16 лет)*

📚 *Формат обучения:*
• Занятия 1 раз в неделю по 90 минут
• Группы до 10 человек
• Интересные задания от опытных методистов
• Геймификация обучения
• Видеоролики с домашними заданиями по теме урока
• Ноутбуки и рабочие тетради для занятий мы выдадим

🎯 *Занимаясь с нами, ребенок сможет:*
• Верстать веб-страницы с помощью HTML и CSS и работать по Техническому Заданию
• Изучить язык программирования Java и попробовать себя в роли Android-разработчика
• Изучить один из самых популярных языков программирования Python
• Создавать 2D игры, приложения для ОС Android и сайты
• Прокачать Soft Skills - умение работать в команде, организовывать рабочее время
• Ясно излагать мысли

🎮 *За время обучения ребенок создаст:*
• 2 сайта-визитки по макету от заказчика с техническим заданием
• Несколько 2D игр на Python
• Настоящего голосового помощника и чат-бота для Telegram с помощью Python
• 3 Android-приложения в программе Intellij IDEA c помощью языка программирования Java

🎁 *Пробное занятие бесплатно!*`,
    {
      parse_mode: "Markdown",
      ...createTrialLessonButton("webdev"), // Добавляем кнопку записи на пробное занятие
    }
  );
});

// Обработка возрастных групп английского языка
// Обработчик для курса Kids (6-15 лет)
// Отправляет фото и подробное описание курса английского языка для младшей группы
bot.hears("Курс Kids 6 - 15 лет", async (ctx) => {
  // Отправляем фото курса
  await ctx.replyWithPhoto("https://imgfoto.host/i/cam0ZI");
  // Отправляем подробное описание с форматированием Markdown
  await ctx.reply(
    `*Курс Kids (для детей 6-15 лет)*

📚 *Формат обучения:*
• 70 уроков по 60 минут
• Группы до 10 человек
• Нескучные уроки, игры и динамические паузы
• Обучение только на английском языке
• Все нужное для занятий мы выдадим: компьютеры и рабочие тетради

🎯 *Занимаясь с нами, ребенок сможет:*
• Научиться читать, писать и разговаривать на английском без барьера
• Развить интеллект и коммуникабельность, обогатить речь
• Подготовиться к экзаменам
• Узнать новое о культуре других стран
• Найти новых друзей

📝 *Во время учебы ребенок будет:*
• Общаться с единомышленниками в дружественной обстановке
• Выполнять задания на платформе Учи.ру и в рабочих тетрадях
• Выполнять задания самостоятельно, а потом разбирать их с наставником
• Всесторонне изучать английский язык

🎁 *Пробный урок и диагностика уровня - бесплатно!*`,
    {
      parse_mode: "Markdown",
      ...createTrialLessonButton("english_kids"), // Добавляем кнопку записи на пробное занятие
    }
  );
});

// Обработчик для курса Junior (10-15 лет)
// Отправляет фото и подробное описание курса английского языка для продвинутой группы
bot.hears("Курс Junior 10 - 15 лет", async (ctx) => {
  // Отправляем фото курса
  await ctx.replyWithPhoto("https://imgfoto.host/i/caLwTM");
  // Отправляем подробное описание с форматированием Markdown
  await ctx.reply(
    `*Курс Junior (для детей 10-15 лет)*
    *Для детей с хорошими знаниями языка*

📚 *Формат обучения:*
• 70 уроков по 80 минут
• Группы до 10 человек
• Нескучные уроки, игры и динамические паузы
• Обучение только на английском языке
• Все нужное для занятий мы выдадим: компьютеры и рабочие тетради

🎯 *Занимаясь с нами, ребенок сможет:*
• Научиться читать, писать и разговаривать на английском без барьера
• Развить интеллект и коммуникабельность, обогатить речь
• Подготовиться к экзаменам
• Узнать новое о культуре других стран
• Найти новых друзей

📝 *Во время учебы ребенок будет:*
• Общаться с единомышленниками в дружественной обстановке
• Выполнять задания на платформе Учи.ру и в рабочих тетрадях
• Выполнять задания самостоятельно, а потом разбирать их с наставником
• Всесторонне изучать английский язык

🎁 *Пробный урок и диагностика уровня - бесплатно!*`,
    {
      parse_mode: "Markdown",
      ...createTrialLessonButton("english_junior"), // Добавляем кнопку записи на пробное занятие
    }
  );
});

// Обработчик возврата к меню услуг
bot.hears("⬅️ Назад к услугам", (ctx) => {
  ctx.reply("Вы вернулись в меню услуг.", servicesMenu);
});

// Обработчик для просмотра фото локации
bot.hears("Фото локации", async (ctx) => {
  await ctx.replyWithPhoto("https://imgfoto.host/i/cjZl0a");
  ctx.reply("Это фото нашего загородного лагеря. У нас красиво и уютно!");
});

// Команда для получения информации о пользователе
// Возвращает ID, username и имя пользователя
bot.command("getid", (ctx) => {
  const userId = ctx.from.id;
  const username = ctx.from.username || "нет";
  const firstName = ctx.from.first_name || "";
  const lastName = ctx.from.last_name || "";

  ctx.reply(
    `📱 Ваши данные:\n` +
      `ID: ${userId}\n` +
      `Username: @${username}\n` +
      `Имя: ${firstName} ${lastName}`
  );
});

// Команда для рассылки сообщений пользователям (/broadcast)
// Доступна только администраторам, указанным в ADMIN_IDS
bot.command("broadcast", async (ctx) => {
  // Проверяем, является ли отправитель администратором
  if (!ADMIN_IDS.includes(ctx.from.id.toString())) {
    return ctx.reply("У вас нет прав для использования этой команды.");
  }

  // Получаем текст сообщения, удаляя команду /broadcast
  const messageText = ctx.message.text.split("/broadcast ")[1];
  if (!messageText) {
    // Если текст не указан, отправляем инструкцию по использованию
    return ctx.reply(
      "Использование: /broadcast <текст>\n" +
        "Для отправки с картинкой, ответьте на это сообщение картинкой"
    );
  }

  // Проверяем, есть ли прикрепленное изображение
  let imageUrl = null;
  if (ctx.message.reply_to_message?.photo) {
    const photos = ctx.message.reply_to_message.photo;
    // Берем последнее фото из массива (оно имеет наилучшее качество)
    const photo = photos[photos.length - 1];
    imageUrl = photo.file_id;
  }

  // Отправляем рассылку и получаем статистику
  const { successCount, errorCount } = await sendNewsletter(
    messageText,
    imageUrl
  );
  // Отправляем отчет о результатах рассылки
  await ctx.reply(
    `Рассылка завершена:\n✅ Успешно: ${successCount}\n❌ Ошибок: ${errorCount}`
  );
});

// Обработчик для неизвестных текстовых сообщений
// Отлавливает все сообщения, которые не были обработаны другими обработчиками
bot.on("text", (ctx) => {
  // Отправляем пользователю сообщение с инструкцией и возвращаем главное меню
  ctx.reply(
    "Пожалуйста, используйте кнопки меню для навигации или наберите /start для перезапуска.",
    mainMenu
  );
});

// Запускаем бота
bot.launch();

// Выводим сообщение об успешном запуске бота в консоль
console.log(
  "Бот запущен с главным меню, подменю услуг и сценарием обратного звонка, интегрированным с Google Sheets."
);
