package com.example.calculadorahh.ui.adapters

import androidx.fragment.app.Fragment
import androidx.fragment.app.FragmentActivity
import androidx.viewpager2.adapter.FragmentStateAdapter
import com.example.calculadorahh.ui.fragments.CalculadoraHHFragment
import com.example.calculadorahh.ui.fragments.RDOFragment

class ViewPagerAdapter(fragmentActivity: FragmentActivity) : FragmentStateAdapter(fragmentActivity) {

    override fun getItemCount(): Int = 2

    override fun createFragment(position: Int): Fragment {
        return when (position) {
            0 -> CalculadoraHHFragment()
            1 -> RDOFragment()
            else -> CalculadoraHHFragment()
        }
    }
}