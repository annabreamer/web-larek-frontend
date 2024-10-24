import {
	AppState,
	CatalogChangeEvent,
	ProductItem,
} from './components/AppData';
import { EventEmitter } from './components/base/events';
import { BasketItem, CatalogItem, ProductCard } from './components/Card';
import { Basket } from './components/common/Basket';
import { Modal } from './components/common/Modal';
import { Success } from './components/common/Success';
import { Order } from './components/Order';
import { Page } from './components/Page';
import { ProductAPI } from './components/ProductApi';
import './scss/styles.scss';
import { IContactInfoForm, IOrderForm, PaymentMethod } from './types';
import { API_URL, CDN_URL } from './utils/constants';
import { cloneTemplate, createElement, ensureElement } from './utils/utils';

const events = new EventEmitter();
const api = new ProductAPI(CDN_URL, API_URL);

// Чтобы мониторить все события, для отладки
events.onAll(({ eventName, data }) => {
	console.log(eventName, data);
});

// Все шаблоны
const cardCatalogTemplate = ensureElement<HTMLTemplateElement>('#card-catalog');
const cardPreviewTemplate = ensureElement<HTMLTemplateElement>('#card-preview');
const basketTemplate = ensureElement<HTMLTemplateElement>('#basket');
const orderTemplate = ensureElement<HTMLTemplateElement>('#order');
const successTemplate = ensureElement<HTMLTemplateElement>('#success');
const contactsTemplate = ensureElement<HTMLTemplateElement>('#contacts');
const cardBasketTemplate = ensureElement<HTMLTemplateElement>('#card-basket');

// Модель данных приложения
const appData = new AppState(events);

// Глобальные контейнеры
const page = new Page(document.body, events);
const modal = new Modal(ensureElement<HTMLElement>('#modal-container'), events);

// Переиспользуемые части интерфейса
const basket = new Basket(cloneTemplate(basketTemplate), events);
const order = new Order(cloneTemplate(orderTemplate), events);
const contacts = new Order(cloneTemplate(contactsTemplate), events);

// Дальше идет бизнес-логика
// Поймали событие, сделали что нужно

// Изменились элементы каталога
events.on<CatalogChangeEvent>('items:changed', () => {
	page.catalog = appData.catalog.map((item) => {
		const card = new CatalogItem(cloneTemplate(cardCatalogTemplate), {
			onClick: () => events.emit('card:select', item),
		});
		return card.render({
			title: item.title,
			image: item.image,
			description: item.description,
			price: item.price,
			category: item.category,
		});
	});

	page.counter = appData.getItemsCount();
});

// Отправлена форма заказа
events.on('order:submit', () => {
	api
		.orderProducts(appData.order)
		.then((result) => {
			const success = new Success(cloneTemplate(successTemplate), {
				onClick: () => {
					modal.close();
					appData.clearOrder();
				},
			});

			modal.render({
				content: success.render({}),
			});
		})
		.catch((err) => {
			console.error(err);
		});
});

// Изменилось состояние валидации формы
events.on('formErrors:change', (errors: Partial<IContactInfoForm>) => {
	const { email, phone } = errors;
	order.valid = !email && !phone;
	order.errors = Object.values({ phone, email })
		.filter((i) => !!i)
		.join('; ');
});

events.on('formErrors:change', (errors: Partial<IOrderForm>) => {
	const { address } = errors;
	order.valid = !address;
	order.errors = Object.values({ address })
		.filter((i) => !!i)
		.join('; ');
});

// Изменилось одно из полей
events.on(
	/^order\..*:change/,
	(data: { field: keyof IContactInfoForm | 'address'; value: string }) => {
		appData.setOrderField(data.field, data.value);
	}
);

events.on(
	'order.payment:change',
	(data: { field: 'payment'; value: string }) => {
		if (data.value === PaymentMethod.Online) {
			appData.setPaymentMethod(PaymentMethod.Online);
		}
		if (data.value === PaymentMethod.OnDelivery) {
			appData.setPaymentMethod(PaymentMethod.OnDelivery);
		}
	}
);

// Открыть корзину
events.on('basket:open', () => {
	modal.render({
		content: createElement<HTMLElement>('div', {}, [basket.render()]),
	});
});

// Открыть форму заказа
events.on('order:open', () => {
	modal.render({
		content: order.render({
			payment: PaymentMethod.Online,
			address: '',
			valid: false,
			errors: [],
		}),
	});
});

// Открыть форму контактной информации
events.on('contacts:open', () => {
	modal.render({
		content: contacts.render({
			phone: '',
			email: '',
			valid: false,
			errors: [],
		}),
	});
});

// Изменения в корзине, но лучше все пересчитать
events.on('basket:changed', () => {
	page.counter = appData.getItemsCount();
	let total = 0;
	if (appData.order) {
		basket.items = appData.order.items.map((item, index) => {
			const card = new BasketItem(cloneTemplate(cardBasketTemplate), {
				onClick: (event) => {
					appData.removeFromOrder(item.id);
				},
			});
			card.index = index + 1;
			total += item.price;
			return card.render({
				title: item.title,
				price: item.price,
			});
		});
	} else {
		basket.items = [];
	}
	basket.total = total;
});

// Открыть товар
events.on('card:select', (item: ProductItem) => {
	appData.setPreview(item);
});

// Изменен открытый выбранный лот
events.on('preview:changed', (item: ProductItem) => {
	const showItem = (item: ProductItem) => {
		const card = new ProductCard(cloneTemplate(cardPreviewTemplate), {
			onClick: () => {
				appData.addToOrder(item);
				modal.close();
			},
		});

		modal.render({
			content: card.render(item),
		});
	};

	if (item) {
		showItem(item);
	} else {
		modal.close();
	}
});

// Блокируем прокрутку страницы если открыта модалка
events.on('modal:open', () => {
	page.locked = true;
});

// ... и разблокируем
events.on('modal:close', () => {
	page.locked = false;
});

// Получаем товары с сервера
api
	.getProductList()
	.then(appData.setCatalog.bind(appData))
	.catch((err) => {
		console.error(err);
	});
