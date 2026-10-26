"""English names for the fund managers and guarantors shown on the site (FIPIRAN lists them in Persian)."""
EN = {
    "بانک تجارت": "Bank Tejarat",
    "بانک توسعه تعاون": "Tose'e Ta'avon Bank",
    "بانک توسعه صادرات ایران": "Export Development Bank of Iran",
    "بانک سامان": "Saman Bank",
    "بانک شهر": "Shahr Bank",
    "بانک صادرات ایران": "Bank Saderat Iran",
    "بانک ملت": "Bank Mellat",
    "بانک پارسیان": "Parsian Bank",
    "بانک کارآفرین": "Karafarin Bank",
    "بانک گردشگری": "Tourism Bank",
    "بیمه سامان": "Saman Insurance",
    "تامین سرمایه امید": "Omid Investment Bank",
    "تامین سرمایه امین": "Amin Investment Bank",
    "تامین سرمایه بانک مسکن": "Bank Maskan Investment Bank",
    "تامین سرمایه بانک ملت": "Bank Mellat Investment Bank",
    "تامین سرمایه تمدن": "Tamadon Investment Bank",
    "تامین سرمایه دماوند": "Damavand Investment Bank",
    "تامین سرمایه سپهر": "Sepehr Investment Bank",
    "تامین سرمایه لوتوس پارسیان": "Lotus Parsian Investment Bank",
    "تامین سرمایه نوین": "Novin Investment Bank",
    "تامین سرمایه کاردان": "Kardan Investment Bank",
    "سبدگردان آگاه": "Agah Asset Management",
    "سبدگردان مفید": "Mofid Asset Management",
    "سبدگردان کاریزما": "Karizma Asset Management",
    "سرمایه‌گذاری ایساتیس پویا": "Isatis Pouya Investment",
    "سرمایه‌گذاری توسعه ملی": "National Development Investment",
    "سرمایه‌گذاری پارس آریان": "Pars Arian Investment",
    "موسسه بنیاد برکت": "Barekat Foundation",
    "کارگزاری بانک آینده": "Bank Ayandeh Brokerage",
    "کارگزاری بانک دی": "Dey Bank Brokerage",
    "کارگزاری بانک صادرات ایران": "Bank Saderat Brokerage",
    "گروه خدمات بازار سرمایه آشنا": "Ashna Capital Market Services",
    "گروه سرمایه‌گذاری توسعه صنعتی ایران": "Iran Industrial Development Investment Group",
}


def english(name):
    """English name of a firm; a firm missing from EN is an error, so no Persian reaches the site."""
    if name is None:
        return None
    if name not in EN:
        raise KeyError(f"add an English name for {name!r} to _tools/firm_names.py")
    return EN[name]
