package com.example.calculadorahh.ui.activities

import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity
import com.example.calculadorahh.R
import com.example.calculadorahh.databinding.ActivityMainBinding
import com.example.calculadorahh.ui.adapters.ViewPagerAdapter
import com.google.android.material.tabs.TabLayoutMediator

class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        // Configurar ViewPager
        val adapter = ViewPagerAdapter(this)
        binding.viewPager.adapter = adapter

        // Conectar TabLayout com ViewPager
        TabLayoutMediator(binding.tabLayout, binding.viewPager) { tab, position ->
            tab.text = when (position) {
                0 -> getString(R.string.tab_calculadora)
                1 -> getString(R.string.tab_rdo)
                else -> ""
            }
        }.attach()

        // Verificar qual aba deve ser aberta
        val tabPosition = intent.getIntExtra("TAB_POSITION", 0)
        binding.viewPager.setCurrentItem(tabPosition, false)

        // Configurar toolbar navigation
        binding.toolbar.setNavigationOnClickListener {
            finish()
        }
    }
}
