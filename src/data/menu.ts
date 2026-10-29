export interface MenuItem {
    title: string
    href?: string
    to?: string
    /** открывается после входа по токену: пока он не введён, рядом замок */
    private?: boolean
}

export interface MenuGroup {
    title: string
    items: MenuItem[]
}

export const menuGroups: MenuGroup[] = [
    {
        title: "IT",
        items: [
            { title: "Обучающая платформа", href: "https://anitech.meeymirita.ru/" },
        ],
    },
    {
        title: "Материалы по корейскому",
        items: [
            { title: "Сегодня", to: "/korean/today", private: true },
            { title: "Корейский", to: "/korean/words" },
            { title: "Игра на слова", to: "/game", private: true },
            { title: "Мой кабинет", to: "/korean/cabinet", private: true },
        ],
    },
];
// ,"Эпизоды","Магия","Галерея","Музыка","Мир","Новости","Фан-арт","Контакты"
