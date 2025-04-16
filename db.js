const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./baza.db', (err) => {
    if (err) {
        console.error('Błąd połączenia z bazą danych:', err.message);
    } else {
        console.log('Połączono z bazą danych.');
    }
});

db.serialize(() => {
    // Tabela Agent
    db.run(`
        CREATE TABLE IF NOT EXISTS Agent (
            Id_agent INTEGER PRIMARY KEY AUTOINCREMENT,
            Imie TEXT NOT NULL,
            Nazwisko TEXT NOT NULL,
            Specjalizacja TEXT
        )
    `);

    // Tabela Kategoria
    db.run(`
        CREATE TABLE IF NOT EXISTS Kategoria (
            Id_kategoria INTEGER PRIMARY KEY AUTOINCREMENT,
            Nazwa TEXT NOT NULL
        )
    `);

    // Tabela Sprawa
    db.run(`
        CREATE TABLE IF NOT EXISTS Sprawa (
            Id_sprawa INTEGER PRIMARY KEY AUTOINCREMENT,
            Imie TEXT NOT NULL,
            Nazwisko TEXT NOT NULL,
            Id_kategoria INTEGER,
            Adres TEXT,
            Telefon TEXT,
            Mail TEXT,
            Opis TEXT,
            Stan TEXT,
            Id_agent INTEGER,
            FOREIGN KEY (Id_kategoria) REFERENCES Kategoria(Id_kategoria),
            FOREIGN KEY (Id_agent) REFERENCES Agent(Id_agent)
        )
    `);

    // Tabela Uzytkownik
    db.run(`
        CREATE TABLE IF NOT EXISTS Uzytkownik (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            imie TEXT NOT NULL,
            nazwisko TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            haslo TEXT NOT NULL,
            rola TEXT NOT NULL
        )
    `);
});

module.exports = db;
