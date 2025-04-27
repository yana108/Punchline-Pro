// import { createRouter, createWebHistory } from "vue-router";
import {
  createRouter,
  createWebHistory,
  createWebHashHistory,
} from "vue-router/auto";

// import PopupView from "/src/views/PopupView.vue";
// import AboutView from "/src/views/AboutView.vue";
// import HistoryView from "/src/views/HistoryView.vue";

// use auto router, unplugin-vue-router
const router = createRouter({
  // history: createWebHistory("/popup.html"),
  history: createWebHashHistory(),
  routes: [
    // {
    //   path: "/",
    //   name: "home",
    //   component: PopupView,
    // },
    // {
    //   path: "/about",
    //   name: "about",
    //   component: AboutView,
    //   //   () => import("/src/views/AboutView.vue"),
    // },
    // {
    //   path: "/history",
    //   name: "history",
    //   component: HistoryView,
    // },
  ],
});

export default router;
