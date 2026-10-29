export interface MenuItem {
    title: string
    href?: string
    to?: string
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
            { title: "Сегодня", to: "/korean/today" },
            { title: "Корейский", to: "/korean/words" },
            { title: "Игра на слова", to: "/game" },
        ],
    },
];
// ,"Эпизоды","Магия","Галерея","Музыка","Мир","Новости","Фан-арт","Контакты"
