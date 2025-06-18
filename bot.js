const { Telegraf, Markup, session } = require("telegraf");
const { google } = require("googleapis");
const path = require("path");
require("dotenv").config();

// Инициализация бота с токеном из .env
const bot = new Telegraf(process.env.BOT_TOKEN);

// Включаем поддержку сессий
bot.use(session());

// Константы из .env
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;

// Настройка Google Auth
const auth = new google.auth.GoogleAuth({
  keyFile: path.join(__dirname, "google-credentials.json"),
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

const sheets = google.sheets({
  version: "v4",
  auth,
});

const mainMenu = Markup.keyboard([
  ["Описание центра"],
  ["Услуги центра"],
  ["Экскурсии по центру"],
  ["Отзывы"],
  ["Контактные данные и адрес"],
  ["Заказать обратный звонок"],
]).resize();

const servicesMenu = Markup.keyboard([
  ["Программирование"],
  ["Английский"],
  ["Скетчинг"],
  ["Летний интенсив"],
  ["Городской клуб полного дня"],
  ["Загородный Кэмп"],
  ["⬅️ В главное меню"],
]).resize();

const programmingAgeMenu = Markup.keyboard([
  ["Курс Junior 7 - 8 лет"],
  ["Курс Middle 9 - 10 лет"],
  ["Курс High 10 - 12 лет"],
  ["Курс Гейм-дизайнер 12 - 16 лет"],
  ["Курс Веб-дизайнер 12 - 16 лет"],
  ["⬅️ Назад к услугам"],
]).resize();

const englishAgeMenu = Markup.keyboard([
  ["Курс Kids 6 - 15 лет"],
  ["Курс Junior 10 - 15 лет"],
  ["⬅️ Назад к услугам"],
]).resize();

const summerIntensiveMenu = Markup.keyboard([
  ["Дизайн в Figma"],
  ["Нейросети"],
  ["⬅️ Назад к услугам"],
]).resize();

const campMenu = Markup.keyboard([
  ["Фото локации"],
  ["⬅️ Назад к услугам"],
]).resize();

// Создаем функцию для генерации инлайн кнопки записи на пробное занятие
function createTrialLessonButton(courseType) {
  const buttonText =
    courseType === "summer_club"
      ? "Узнать о сменах"
      : "Записаться на пробное занятие";
  return Markup.inlineKeyboard([
    [Markup.button.callback(buttonText, `trial_${courseType}`)],
  ]);
}

async function appendToSheet(
  data,
  requestType = "Обратный звонок",
  course = ""
) {
  try {
    const timestamp = new Date().toLocaleString();
    const rowData = [...data, requestType, course];
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: "Запись!A:G", // Расширяем диапазон для новых столбцов
      valueInputOption: "USER_ENTERED",
      resource: {
        values: [rowData],
      },
    });
    console.log("Данные успешно записаны в Google таблицу.");
  } catch (error) {
    console.error("Ошибка записи в Google таблицу:", error.message);
  }
}

// Функция логирования действий пользователя
async function logUserAction(ctx, action) {
  try {
    const date = new Date().toLocaleString("ru");
    const userId = ctx.from?.id || "неизвестно";
    const username = ctx.from?.username || "нет";
    const firstName = ctx.from?.first_name || "неизвестно";
    const lastName = ctx.from?.last_name || "";
    const fullName = `${firstName} ${lastName}`.trim();

    const rowData = [date, userId, username, fullName, action];

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

// Функция для сохранения пользователя в список рассылки
async function saveUserToNewsletter(ctx) {
  try {
    const userId = ctx.from?.id;
    const username = ctx.from?.username || "нет";
    const firstName = ctx.from?.first_name || "";
    const lastName = ctx.from?.last_name || "";
    const date = new Date().toLocaleString("ru");

    // Проверяем, есть ли уже такой пользователь
    const sheets = google.sheets({ version: "v4", auth });
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: "Рассылка!A:D",
    });

    const rows = response.data.values || [];
    const userExists = rows.some((row) => row[0] === userId.toString());

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

// Функция для отправки рассылки
async function sendNewsletter(message, imageUrl = null) {
  try {
    const sheets = google.sheets({ version: "v4", auth });
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: "Рассылка!A:A",
    });

    const rows = response.data.values || [];
    let successCount = 0;
    let errorCount = 0;

    for (const row of rows) {
      const userId = row[0];
      try {
        if (imageUrl) {
          await bot.telegram.sendPhoto(userId, imageUrl, {
            caption: message,
            parse_mode: "MarkdownV2",
          });
        } else {
          await bot.telegram.sendMessage(userId, message, {
            parse_mode: "MarkdownV2",
          });
        }
        successCount++;
        // Делаем паузу между отправками, чтобы избежать ограничений Telegram
        await new Promise((resolve) => setTimeout(resolve, 100));
      } catch (error) {
        errorCount++;
        console.error(
          `Ошибка отправки сообщения пользователю ${userId}:`,
          error
        );
      }
    }
    return { successCount, errorCount };
  } catch (error) {
    console.error("Ошибка при выполнении рассылки:", error);
    return { successCount: 0, errorCount: 0 };
  }
}

// Массив ID администраторов
const ADMIN_IDS = ["502105220, 5734831768, 451751415"]; // Замените на ваш реальный ID, который получите через команду /getid

bot.start(async (ctx) => {
  await logUserAction(ctx, "Запуск бота");
  await saveUserToNewsletter(ctx);
  await ctx.replyWithPhoto("https://imgfoto.host/i/cQ0VbO");
  await ctx.reply(
    "Добро пожаловать в детский центр Учи.ру|Челябинск! Выберите интересующий раздел:",
    mainMenu
  );
});

bot.hears("Описание центра", (ctx) =>
  ctx.reply(
    `🎓 *Очные занятия* по трём направлениям, а также *летний клуб дневного пребывания* для детей в группах до пятнадцати человек.

📚 *Немного о детском центре:*

  *3 кружка:*
   - 💻 Программирование для детей 7–16 лет
   - 🇬🇧 Английский язык для детей 6–13 лет
   - 🎨 Скетчинг (быстрые зарисовки) для детей 7-12 лет

  *Также:*
   - ☀️ Летний клуб дневного пребывания с 8:00 до 19:00 для детей 7–12 лет.
   - 🚀 Летние интенсивы по изучению нейросетей, 3D-моделирования и дизайна для детей 12–16 лет.

📍 *Наши занятия проходят в центре Учи.ру|Челябинск по адресу:*
   - г. Челябинск, ул. Университетская Набережная, 103.


✨ *Преимущества нашего центра:*
- Занятия проходят 1–2 раза в неделю
- Все нужное для занятий мы выдадим: планшеты, ноутбуки и рабочие тетради
- Выдаем сертификат и грамоты от Учи.ру
- Используем современные образовательные методики
- Методики нашей школы сертифицированы в МГПУ
- Группы до 10 человек, индивидуальный подход к каждому
- Мотивирующая система баллов
-  Все преподаватели проходят аттестацию

🎯 *На наших занятиях ребенок сможет:*
- Попробовать себя в качестве веб-разработчика, геймдизайнера и 3D-моделлера
- Научиться читать, писать и разговаривать на английском языке без барьера
- Развить мышление, речь, логику, интеллект и коммуникабельность
- Научится эффективно переносить свои идеи на бумагу
- Найти новых друзей.

🎁 *Пробное занятие — бесплатно!*`,
    { parse_mode: "Markdown" }
  )
);

bot.hears("Услуги центра", async (ctx) => {
  await logUserAction(ctx, "Открытие раздела услуг центра");
  ctx.reply("Выберите услугу:", servicesMenu);
});

bot.hears("Экскурсии по центру", async (ctx) => {
  await logUserAction(ctx, "Открытие раздела экскурсии по центру");
  ctx.reply("Здесь будет информация об экскурсиях по центру.");
});

bot.hears("Отзывы", async (ctx) => {
  await logUserAction(ctx, "Открытие раздела отзывы");
  await ctx.reply(
    `*Отзывы о нашем центре*

⭐️ Мы гордимся тем, что делаем, и рады получать отзывы от наших учеников и их родителей!

📱 Выберите удобную для вас платформу, чтобы прочитать отзывы или оставить свой:`,
    {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        [
          Markup.button.url(
            "📍 Отзывы на Яндекс.Картах",
            "https://yandex.ru/maps/org/uchi_ru/75683029498/reviews/?ll=61.314779%2C55.171792&tab=reviews&z=17.57"
          ),
        ],
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
bot.hears("Контактные данные и адрес", async (ctx) => {
  await logUserAction(ctx, "Открытие раздела контактные данные и адрес");
  await ctx.replyWithLocation(55.171639, 61.314225);
  await ctx.reply(
    `*Контакты детского центра Учи\\.ру\\|Челябинск*

📍 *Наш адрес:*
г\\. Челябинск, ул\\. Университетская набережная, д\\.103

📞 *Телефон для связи:*
\\+7 \\(906\\) 870\\-38\\-08

✨ *Способы связи:*
• Менеджер для связи: @Uchiru\\_74
• Сообщество ВКонтакте: vk\\.com/uchi\\.ru\\_center\\_chelyabinsk
• Официальный сайт: uchiru\\-chel\\.clients\\.site

Выберите удобный способ связи или построить маршрут:`,
    {
      parse_mode: "MarkdownV2",
      ...Markup.inlineKeyboard([
        [Markup.button.url("📱 Написать менеджеру", "https://t.me/Uchiru_74")],
        [
          Markup.button.url(
            "🌐 Перейти на сайт",
            "https://uchiru-chel.clients.site/"
          ),
        ],
        [
          Markup.button.url(
            "💙 Группа ВКонтакте",
            "https://vk.com/uchi.ru_center_chelyabinsk"
          ),
        ],
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

// Сценарий для обратного звонка
bot.hears("Заказать обратный звонок", (ctx) => {
  ctx.reply(
    "Пожалуйста, отправьте свой номер телефона для обратного звонка, нажав на кнопку ниже:",
    Markup.keyboard([
      [Markup.button.contactRequest("Отправить номер телефона")],
      ["⬅️ В главное меню"],
    ]).resize()
  );
});

// Обработчики кнопок записи на пробное занятие
const trialLessonCallbacks = {
  junior: "Программирование - Курс Junior (7-8 лет)",
  middle: "Программирование - Курс Middle (9-10 лет)",
  high: "Программирование - Курс High (10-12 лет)",
  gamedev: "Программирование - Курс Гейм-дизайнер (12-16 лет)",
  webdev: "Программирование - Курс Веб-дизайнер (12-16 лет)",
  english_kids: "Английский язык - Курс Kids (6-15 лет)",
  english_junior: "Английский язык - Курс Junior (10-15 лет)",
  sketch: "Скетчинг - Курс для детей 7-12 лет",
  summer_figma: "Летний интенсив - Дизайн в Figma (12-16 лет)",
  summer_ai: "Летний интенсив - Нейросети (12-16 лет)",
  summer_club: "Городской клуб полного дня",
  summer_camp: "Загородный кэмп",
};

Object.keys(trialLessonCallbacks).forEach((course) => {
  bot.action(`trial_${course}`, async (ctx) => {
    ctx.session = {
      awaitingContact: true,
      course: trialLessonCallbacks[course],
    };

    const message =
      course === "summer_club"
        ? "Пожалуйста, отправьте свой номер телефона для связи с менеджером. Мы расскажем о доступных сменах и ответим на все вопросы:"
        : `Запись на пробное занятие:\n${trialLessonCallbacks[course]}\n\nПожалуйста, отправьте свой номер телефона, нажав на кнопку ниже:`;

    await ctx.reply(
      message,
      Markup.keyboard([
        [Markup.button.contactRequest("Отправить номер телефона")],
        ["⬅️ В главное меню"],
      ]).resize()
    );

    await ctx.answerCbQuery();
  });
});

bot.action("book_camp", async (ctx) => {
  ctx.session = {
    awaitingContact: true,
    course: "Загородный кэмп",
  };

  await ctx.reply(
    "Для бронирования смены в загородном кэмпе, пожалуйста, отправьте свой номер телефона. Наш менеджер свяжется с вами, расскажет о доступных сменах и поможет с оформлением:",
    Markup.keyboard([
      [Markup.button.contactRequest("Отправить номер телефона")],
      ["⬅️ В главное меню"],
    ]).resize()
  );

  await ctx.answerCbQuery();
});

bot.on("contact", async (ctx) => {
  const phone = ctx.message.contact.phone_number;
  await logUserAction(ctx, `Отправка контакта: ${phone}`);
  const firstName = ctx.message.contact.first_name || "";
  const lastName = ctx.message.contact.last_name || "";
  const username = ctx.message.from.username || "";
  const date = new Date().toLocaleString("ru");

  const requestType = ctx.session?.awaitingContact
    ? "Запись на пробное занятие"
    : "Обратный звонок";
  const course = ctx.session?.course || "";

  const rowData = [date, firstName, lastName, username, phone];
  await appendToSheet(rowData, requestType, course);

  let responseMessage = "Спасибо! ";
  if (course === "Загородный кэмп") {
    responseMessage =
      "Спасибо за интерес к нашему загородному кэмпу! Менеджер свяжется с вами в ближайшее время, расскажет о доступных сменах и поможет с оформлением.";
  } else if (course === "Городской клуб полного дня") {
    responseMessage =
      "Спасибо за интерес к нашему городскому клубу! Менеджер свяжется с вами в ближайшее время и расскажет подробнее о сменах и программе.";
  } else if (requestType === "Запись на пробное занятие") {
    responseMessage += `Ваша заявка на пробное занятие по курсу "${course}" принята. Мы свяжемся с вами в ближайшее время по номеру ${phone}.`;
  } else {
    responseMessage += `Мы свяжемся с вами в ближайшее время по номеру ${phone}.`;
  }

  ctx.reply(responseMessage, mainMenu);
  console.log(
    `Получена заявка: ${requestType} ${
      course ? `на курс ${course}` : ""
    } от ${firstName} ${lastName}, ${phone}`
  );

  // Очищаем сессию
  ctx.session = {};
});

bot.hears("Программирование", async (ctx) => {
  await logUserAction(ctx, "Открытие раздела Программирование");
  await ctx.replyWithPhoto("https://imgfoto.host/i/cQvADk");
  ctx.reply(
    "Курсы программирования. Выберите возрастную группу:",
    programmingAgeMenu
  );
});

bot.hears("Английский", async (ctx) => {
  await logUserAction(ctx, "Открытие раздела Английский");
  await ctx.replyWithPhoto("https://imgfoto.host/i/cQNyt5");
  ctx.reply(
    "Курсы английского языка. Выберите возрастную группу:",
    englishAgeMenu
  );
});

bot.hears("Скетчинг", async (ctx) => {
  await logUserAction(ctx, "Открытие раздела Скетчинг");
  await ctx.replyWithPhoto("https://imgfoto.host/i/cW7duY");
  await ctx.reply(
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
      parse_mode: "Markdown",
      ...createTrialLessonButton("sketch"),
    }
  );
});

bot.hears("Летний интенсив", async (ctx) => {
  await logUserAction(ctx, "Открытие раздела Летний интенсив");
  await ctx.replyWithPhoto("https://imgfoto.host/i/cjSNmw");
  ctx.reply("Выберите направление летнего интенсива:", summerIntensiveMenu);
});

bot.hears("Городской клуб полного дня", async (ctx) => {
  await logUserAction(ctx, "Открытие раздела Городской клуб полного дня");
  await ctx.replyWithPhoto("https://imgfoto.host/i/cjZl0a");
  await ctx.reply(
    `*Городской клуб полного дня*

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

bot.hears("Загородный Кэмп", async (ctx) => {
  await logUserAction(ctx, "Открытие раздела Загородный Кэмп");
  await ctx.replyWithPhoto("https://imgfoto.host/i/c2p5Gk");
  await ctx.reply(
    `*🌟Летний загородный кэмп🌟*

Яркая развлекательно\\-образовательная смена летних каникул с командой «English by Bai» & «Учи\\.ру» — это уникальная возможность для детей весело и с практической пользой провести время в *загородном отеле Аврора на берегу озера Киреты*\\.`,
    {
      parse_mode: "MarkdownV2",
      reply_markup: {
        inline_keyboard: [
          [{ text: "🏕 Забронировать смену", callback_data: "book_camp" }],
        ],
      },
    }
  );
  await ctx.reply(
    "Чтобы увидеть больше фотографий локации, нажмите кнопку в меню",
    {
      parse_mode: "MarkdownV2",
      ...Markup.keyboard([["Фото локации"], ["⬅️ Назад к услугам"]]).resize(),
    }
  );
});

// Хранилище для фотографий локации
const campPhotos = {
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
  currentIndex: 0,
};

bot.hears("Фото локации", async (ctx) => {
  await logUserAction(ctx, "Просмотр фотографий локации кэмпа");
  // Отправляем первую фотографию с кнопками навигации
  await ctx.replyWithPhoto(
    { source: campPhotos.photos[0] },
    {
      caption: `Фотография 1 из ${campPhotos.photos.length}`,
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
});

// Обработчики кнопок навигации
bot.action("prev_photo", async (ctx) => {
  campPhotos.currentIndex =
    (campPhotos.currentIndex - 1 + campPhotos.photos.length) %
    campPhotos.photos.length;
  try {
    await ctx.editMessageMedia(
      {
        type: "photo",
        media: { source: campPhotos.photos[campPhotos.currentIndex] },
        caption: `Фотография ${campPhotos.currentIndex + 1} из ${
          campPhotos.photos.length
        }`,
      },
      {
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
  await ctx.answerCbQuery();
});

bot.action("next_photo", async (ctx) => {
  campPhotos.currentIndex =
    (campPhotos.currentIndex + 1) % campPhotos.photos.length;
  try {
    await ctx.editMessageMedia(
      {
        type: "photo",
        media: { source: campPhotos.photos[campPhotos.currentIndex] },
        caption: `Фотография ${campPhotos.currentIndex + 1} из ${
          campPhotos.photos.length
        }`,
      },
      {
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
  await ctx.answerCbQuery();
});
// bot.hears("⬅️ В главное меню", (ctx) =>
//   ctx.reply("Вы вернулись в главное меню.", mainMenu)
// );

// Обработка направлений летнего интенсива
bot.hears("Дизайн в Figma", async (ctx) => {
  await ctx.replyWithPhoto("https://imgfoto.host/i/ct3NXd");
  await ctx.reply(
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
      parse_mode: "Markdown",
      ...createTrialLessonButton("summer_figma"),
    }
  );
});

bot.hears("Нейросети", async (ctx) => {
  await ctx.replyWithPhoto("https://imgfoto.host/i/ct3dFK");
  await ctx.reply(
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

bot.hears("⬅️ В главное меню", (ctx) =>
  ctx.reply("Вы вернулись в главное меню.", mainMenu)
);

// Обработка возрастных групп программирования
bot.hears("Курс Junior 7 - 8 лет", async (ctx) => {
  await ctx.replyWithPhoto("https://imgfoto.host/i/cQRMta");
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
      ...createTrialLessonButton("junior"),
    }
  );
});

bot.hears("Курс Middle 9 - 10 лет", async (ctx) => {
  await ctx.replyWithPhoto("https://imgfoto.host/i/cQTu3M");
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
      ...createTrialLessonButton("middle"),
    }
  );
});

bot.hears("Курс High 10 - 12 лет", async (ctx) => {
  await ctx.replyWithPhoto("https://imgfoto.host/i/cQV5fV");
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
      ...createTrialLessonButton("high"),
    }
  );
});

bot.hears("Курс Гейм-дизайнер 12 - 16 лет", async (ctx) => {
  await ctx.replyWithPhoto("https://imgfoto.host/i/cQSDbl");
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
      ...createTrialLessonButton("gamedev"),
    }
  );
});

bot.hears("Курс Веб-дизайнер 12 - 16 лет", async (ctx) => {
  await ctx.replyWithPhoto("https://imgfoto.host/i/cQHzSV");
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
      ...createTrialLessonButton("webdev"),
    }
  );
});

// Обработка возрастных групп английского языка
bot.hears("Курс Kids 6 - 15 лет", async (ctx) => {
  await ctx.replyWithPhoto("https://imgfoto.host/i/cam0ZI");
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
      ...createTrialLessonButton("english_kids"),
    }
  );
});

bot.hears("Курс Junior 10 - 15 лет", async (ctx) => {
  await ctx.replyWithPhoto("https://imgfoto.host/i/caLwTM");
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
      ...createTrialLessonButton("english_junior"),
    }
  );
});

bot.hears("⬅️ Назад к услугам", (ctx) => {
  ctx.reply("Вы вернулись в меню услуг.", servicesMenu);
});

bot.hears("Фото локации", async (ctx) => {
  await ctx.replyWithPhoto("https://imgfoto.host/i/cjZl0a");
  ctx.reply("Это фото нашего загородного лагеря. У нас красиво и уютно!");
});

// Команда для получения ID пользователя
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

// Команда для рассылки (только для администраторов)
bot.command("broadcast", async (ctx) => {
  if (!ADMIN_IDS.includes(ctx.from.id.toString())) {
    return ctx.reply("У вас нет прав для использования этой команды.");
  }

  const messageText = ctx.message.text.split("/broadcast ")[1];
  if (!messageText) {
    return ctx.reply(
      "Использование: /broadcast <текст>\n" +
        "Для отправки с картинкой, ответьте на это сообщение картинкой"
    );
  }

  let imageUrl = null;
  if (ctx.message.reply_to_message?.photo) {
    const photos = ctx.message.reply_to_message.photo;
    const photo = photos[photos.length - 1];
    imageUrl = photo.file_id;
  }

  const { successCount, errorCount } = await sendNewsletter(
    messageText,
    imageUrl
  );
  await ctx.reply(
    `Рассылка завершена:\n✅ Успешно: ${successCount}\n❌ Ошибок: ${errorCount}`
  );
});

// Запасной обработчик для любых текстовых сообщений, которые не были пойманы другими обработчиками
bot.on("text", (ctx) => {
  // Если пользователь отправил любой текст, который не является командой или известной кнопкой
  // Мы можем просто отправить главное меню обратно, чтобы клавиатура снова появилась.
  ctx.reply(
    "Пожалуйста, используйте кнопки меню для навигации или наберите /start для перезапуска.",
    mainMenu
  );
});

bot.launch();

console.log(
  "Бот запущен с главным меню, подменю услуг и сценарием обратного звонка, интегрированным с Google Sheets."
);
