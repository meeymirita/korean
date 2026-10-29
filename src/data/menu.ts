export interface MenuItem {
    title: string
    href?: string
    to?: string
}

export const menu: MenuItem[] = [
    { title: "Главная", to: "/" },
    { title: "Обучающая платформа", href: "https://anitech.meeymirita.ru/" },
    { title: "Корейский", to: "/korean/words" },
];
// ,"Эпизоды","Магия","Галерея","Музыка","Мир","Новости","Фан-арт","Контакты"
